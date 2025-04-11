// main.js – Main module that controls spawn logic, task assignment, and role execution

// Import role modules and the task manager
const roleHarvester = require('role.harvester');
const roleHauler    = require('role.hauler');
const roleScout     = require('role.scout');
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
        // Always build creeps with full available energy (spawn.room.energyCapacityAvailable),
        // unless there are no creeps (emergency situation) – then use what's available.
        const room        = spawn.room;
        const energyAvail = room.energyAvailable;
        const energyCap   = room.energyCapacityAvailable;

        // Determine desired number of creeps for each role (can adjust as RCL increases)
        const sources = room.find(FIND_SOURCES);
        const numSources = sources.length;
        const desiredHarvesters = numSources;      // one Harvester per source (stationary on container)
        const desiredHaulers    = numSources;      // one Hauler per source (to maximize throughput)
        const desiredScouts     = 1;               // one Scout for exploring adjacent rooms

        // Count existing creeps by role
        const harvesters = _.filter(Game.creeps, creep => creep.memory.role === 'harvester');
        const haulers    = _.filter(Game.creeps, creep => creep.memory.role === 'hauler');
        const scouts     = _.filter(Game.creeps, creep => creep.memory.role === 'scout');

        // Only attempt to spawn if not currently busy spawning another creep
        if (!spawn.spawning) {
            // Emergency spawn: if no creeps at all, spawn a Harvester with whatever energy is available
            if (Object.keys(Game.creeps).length === 0) {
                if (energyAvail >= 200) {
                    // Use at least [WORK, CARRY, MOVE] = 200 energy to bootstrap harvesting
                    spawn.spawnCreep([WORK, CARRY, MOVE], 'Harvester-' + Game.time, { 
                        memory: { role: 'harvester' }
                    });
                } else if (energyAvail >= 150) {
                    // If energy is very low, spawn [WORK, MOVE] = 150 (will drop mined energy on ground)
                    spawn.spawnCreep([WORK, MOVE], 'Harvester-' + Game.time, { 
                        memory: { role: 'harvester' }
                    });
                }
                // (If <150 energy available and no creeps, we cannot spawn anything)
            }
            // Normal spawning (use full capacity available for each new creep)
            else {
                // **1. Creep Roles and Body Configs**: use optimal body configs for 300 energy at RCL1
                const harvesterBody = [WORK, WORK, MOVE, CARRY];                  // 300 energy: 2 WORK for max harvest, minimal CARRY/MOVE
                const haulerBody    = [CARRY, CARRY, CARRY, CARRY, MOVE, MOVE];   // 300 energy: 4 CARRY for capacity, 2 MOVE for reasonable speed
                const scoutBody     = [MOVE];                                    // 50 energy: 1 MOVE for cheap scouting

                // Spawn Harvesters until desired count is reached
                if (harvesters.length < desiredHarvesters) {
                    // Assign this harvester to an unassigned source (to ensure one per source)
                    let targetSource = null;
                    for (const src of sources) {
                        if (!harvesters.find(h => h.memory.sourceId === src.id)) {
                            targetSource = src;
                            break;
                        }
                    }
                    // Spawn the harvester with full energy capacity (or as defined body)
                    spawn.spawnCreep(harvesterBody, 'Harvester-' + Game.time, {
                        memory: { role: 'harvester', sourceId: targetSource ? targetSource.id : null }
                    });
                }
                // Spawn Haulers until desired count is reached
                else if (haulers.length < desiredHaulers) {
                    spawn.spawnCreep(haulerBody, 'Hauler-' + Game.time, {
                        memory: { role: 'hauler' }
                    });
                }
                // Spawn a Scout if none exists (only 1 needed)
                else if (scouts.length < desiredScouts) {
                    spawn.spawnCreep(scoutBody, 'Scout-' + Game.time, {
                        memory: { role: 'scout', homeRoom: room.name }
                    });
                }
            }
        }
    }

    // **4. Task Management System**: assign energy haul tasks to avoid overlap (greedy assignment)
    taskManager.assignTasks();

    // Execute role behavior for each creep
    for (let name in Game.creeps) {
        const creep = Game.creeps[name];
        if (creep.memory.role === 'harvester') {
            roleHarvester.run(creep);
        } else if (creep.memory.role === 'hauler') {
            roleHauler.run(creep);
        } else if (creep.memory.role === 'scout') {
            roleScout.run(creep);
        }
    }
};
