// main.js – Main module that controls spawn logic, task assignment, and role execution

// Import role modules and the task manager
const roleHarvester = require('role.harvester');
const roleHauler    = require('role.hauler');
const roleScout     = require('role.scout');
const roleUpgrader  = require('role.upgrader'); // Import the upgrader role
const roleBuilder   = require('role.builder');  // Import the builder role for later use
const taskManager   = require('taskManager');

module.exports.loop = function () {
    // Clean up memory of dead creeps to free up names and memory
    for (let name in Memory.creeps) {
        if (!Game.creeps[name]) {
            delete Memory.creeps[name];
        }
    }

    // Get the primary Spawn (assumes one spawn in RCL1; adjust if multiple)
    const spawn = Game.spawns['Spawn1'] || Object.values(Game.spawns)[0];
    if (spawn) {
        // **Creep Spawning Logic**:
        // Always build creeps with full available energy (spawn.room.energyCapacityAvailable)
        const room        = spawn.room;
        const energyAvail = room.energyAvailable;
        const energyCap   = room.energyCapacityAvailable;
        const rcl         = room.controller.level;

        // Count existing creeps by role
        const harvesters = _.filter(Game.creeps, creep => creep.memory.role === 'harvester');
        const haulers    = _.filter(Game.creeps, creep => creep.memory.role === 'hauler');
        const upgraders  = _.filter(Game.creeps, creep => creep.memory.role === 'upgrader');
        const builders   = _.filter(Game.creeps, creep => creep.memory.role === 'builder');
        const scouts     = _.filter(Game.creeps, creep => creep.memory.role === 'scout');

        // Initialize Memory.roomSources if it doesn't exist
        if (!Memory.roomSources) {
            Memory.roomSources = {};
        }
        
        // Get sources from the current room
        const sources = room.find(FIND_SOURCES);
        let totalSources = sources.length;
        
        // Store source information for this room
        Memory.roomSources[room.name] = {
            count: sources.length,
            hostile: false // We control this room
        };
        
        // Count sources in adjacent non-hostile rooms
        if (Memory.rooms) {
            for (const roomName in Memory.rooms) {
                // Skip our current room and rooms not scouted yet
                if (roomName === room.name || !Memory.rooms[roomName].lastScouted) continue;
                
                // Check if room is non-hostile (no owner or is ours)
                const isHostile = Memory.rooms[roomName].owner && Memory.rooms[roomName].owner !== Game.spawns['Spawn1'].owner.username;
                
                // Add sources from non-hostile adjacent rooms
                if (!isHostile && Memory.rooms[roomName].sourceCount) {
                    totalSources += Memory.rooms[roomName].sourceCount;
                    
                    // Store this information for later use
                    Memory.roomSources[roomName] = {
                        count: Memory.rooms[roomName].sourceCount,
                        hostile: false
                    };
                } else if (isHostile && Memory.rooms[roomName].sourceCount) {
                    // Store info about hostile rooms too
                    Memory.roomSources[roomName] = {
                        count: Memory.rooms[roomName].sourceCount,
                        hostile: true
                    };
                }
            }
        }
        
        // Determine desired number of creeps for each role
        const desiredHarvesters = totalSources;         // One harvester per source in our room + non-hostile rooms
        const desiredHaulers    = desiredHarvesters * 2; // Two haulers per harvester (1:2 ratio)
        const desiredScouts     = 1;                     // One scout for exploration
        
        // Only add upgraders and builders after we have enough resource gathering infrastructure
        const hasEnoughGatherers = (harvesters.length >= desiredHarvesters && haulers.length >= desiredHaulers);
        const desiredUpgraders  = hasEnoughGatherers ? (rcl >= 2 ? 2 : 1) : 0;
        const desiredBuilders   = (hasEnoughGatherers && rcl >= 2) ? 1 : 0;

        // Log current creep counts for debugging
        console.log(`Harvesters: ${harvesters.length}/${desiredHarvesters}, Haulers: ${haulers.length}/${desiredHaulers}, Upgraders: ${upgraders.length}/${desiredUpgraders}, Scouts: ${scouts.length}/${desiredScouts}`);

        // Only attempt to spawn if not currently busy spawning another creep
        if (!spawn.spawning) {
            // **1. Creep Roles and Body Configs**: use optimal body configs for 300 energy at RCL1
            const harvesterBody = [WORK, WORK, MOVE, CARRY];                  // 300 energy: 2 WORK for max harvest, minimal CARRY/MOVE
            const haulerBody    = [CARRY, CARRY, CARRY, CARRY, MOVE, MOVE];   // 300 energy: 4 CARRY for capacity, 2 MOVE for reasonable speed
            const upgraderBody  = [WORK, CARRY, CARRY, MOVE, MOVE];           // 300 energy: 1 WORK, 2 CARRY, 2 MOVE for upgrading
            const builderBody   = [WORK, CARRY, CARRY, MOVE, MOVE];           // 300 energy: same as upgrader
            const scoutBody     = [MOVE];                                     // 50 energy: 1 MOVE for cheap scouting

            // Updated priority order for spawning:
            // Stage 1: Initial setup - 1 harvester → 1 hauler → 1 scout
            // Stage 2: Scale harvester/hauler pairs for all available sources
            // Stage 3: Add upgraders once resource gathering is established
            
            // STAGE 1: Initial setup (first harvester, hauler, and scout)
            if (harvesters.length === 0) {
                // First priority: Spawn our first harvester
                const targetSource = sources[0]; // Use first source in current room
                const result = spawn.spawnCreep(harvesterBody, 'Harvester-' + Game.time, {
                    memory: { role: 'harvester', sourceId: targetSource.id }
                });
                console.log('Spawning first harvester: ' + result);
            }
            else if (haulers.length === 0) {
                // Second priority: Spawn our first hauler
                const result = spawn.spawnCreep(haulerBody, 'Hauler-' + Game.time, {
                    memory: { role: 'hauler' }
                });
                console.log('Spawning first hauler: ' + result);
            }
            else if (scouts.length === 0) {
                // Third priority: Spawn our first scout
                const result = spawn.spawnCreep(scoutBody, 'Scout-' + Game.time, {
                    memory: { role: 'scout', homeRoom: room.name }
                });
                console.log('Spawning first scout: ' + result);
            }
            // STAGE 2: Scale harvesters and haulers for all available sources
            else if (harvesters.length < desiredHarvesters) {
                // Find an unassigned source in our room first
                let targetSource = null;
                let targetRoom = null;
                
                // First check our current room
                for (const src of sources) {
                    if (!_.some(Game.creeps, c => c.memory.role === 'harvester' && c.memory.sourceId === src.id)) {
                        targetSource = src;
                        targetRoom = room.name;
                        break;
                    }
                }
                
                // If no source found in our room, check adjacent non-hostile rooms
                if (!targetSource && Memory.rooms) {
                    for (const roomName in Memory.roomSources) {
                        // Skip hostile or current rooms
                        if (roomName === room.name || Memory.roomSources[roomName].hostile) continue;
                        
                        // Get source info from memory
                        if (Memory.rooms[roomName] && Memory.rooms[roomName].sources) {
                            const remoteSources = Memory.rooms[roomName].sources;
                            
                            // Check if any of these sources don't have a harvester assigned
                            for (const src of remoteSources) {
                                // Create a unique ID for this source
                                const sourceId = roomName + "_" + src.x + "_" + src.y;
                                
                                if (!_.some(Game.creeps, c => c.memory.role === 'harvester' && c.memory.sourceId === sourceId)) {
                                    targetSource = { id: sourceId };
                                    targetRoom = roomName;
                                    break;
                                }
                            }
                            if (targetSource) break;
                        }
                    }
                }
                
                if (targetSource) {
                    // Spawn the harvester with assigned source
                    const result = spawn.spawnCreep(harvesterBody, 'Harvester-' + Game.time, {
                        memory: { 
                            role: 'harvester', 
                            sourceId: targetSource.id,
                            targetRoom: targetRoom
                        }
                    });
                    console.log(`Spawning harvester for ${targetRoom}: ${result}`);
                }
            }
            else if (haulers.length < desiredHaulers) {
                // Priority: Spawn more haulers (2 haulers per harvester)
                const result = spawn.spawnCreep(haulerBody, 'Hauler-' + Game.time, {
                    memory: { role: 'hauler' }
                });
                console.log('Spawning additional hauler: ' + result);
            }
            // STAGE 3: Add upgraders once resource infrastructure is in place
            else if (upgraders.length < desiredUpgraders) {
                const result = spawn.spawnCreep(upgraderBody, 'Upgrader-' + Game.time, {
                    memory: { role: 'upgrader' }
                });
                console.log('Spawning upgrader: ' + result);
            }
            // Add builders once at RCL 2
            else if (rcl >= 2 && builders.length < desiredBuilders) {
                const result = spawn.spawnCreep(builderBody, 'Builder-' + Game.time, {
                    memory: { role: 'builder' }
                });
                console.log('Spawning builder: ' + result);
            }
        }
    }

    // **4. Task Management System**: assign energy haul tasks to avoid overlap (greedy assignment)
    taskManager.assignTasks();
    
    // Assign haulers to harvesters based on the 2:1 ratio
    taskManager.assignHaulersToHarvesters();
    
    // Report colony status for debugging (every 10 ticks)
    taskManager.reportStatus();

    // Execute role behavior for each creep
    for (let name in Game.creeps) {
        const creep = Game.creeps[name];
        if (creep.memory.role === 'harvester') {
            roleHarvester.run(creep);
        } else if (creep.memory.role === 'hauler') {
            roleHauler.run(creep);
        } else if (creep.memory.role === 'upgrader') {
            roleUpgrader.run(creep);
        } else if (creep.memory.role === 'builder') {
            roleBuilder.run(creep);
        } else if (creep.memory.role === 'scout') {
            roleScout.run(creep);
        }
    }
};