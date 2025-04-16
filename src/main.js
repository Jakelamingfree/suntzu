// Import creep roles
var roleHarvester = require('role.harvester');
var roleUpgrader = require('role.upgrader');
var roleHauler = require('role.hauler');
var roleScout = require('role.scout');

// This function runs every tick
module.exports.loop = function() {
    // Garbage collection: remove dead creeps from memory
    for (var creepName in Memory.creeps) {
        if (!Game.creeps[creepName]) {
            delete Memory.creeps[creepName];
            console.log('Clearing non-existing creep memory:', creepName);
            
            // Also clean up from priorityUpgraders if it exists
            if (Memory.priorityUpgraders && Memory.priorityUpgraders[creepName]) {
                delete Memory.priorityUpgraders[creepName];
            }
        }
    }
    
    // Initialize game state memory if needed
    if (!Memory.gameState) {
        Memory.gameState = {
            scoutingPhase: true,           // Initially in scouting phase
            initialScoutSpawned: false,    // Track if initial scout spawned
            expansionMode: 'scaling',      // Default to scaling mode
            availableSources: 0,           // Count of available sources
            lastSourceCount: 0,            // Last count to detect changes
            scoutingComplete: false        // Whether all rooms have been scouted
        };
    }
    
    // Update scouting status from scout memory
    if (Memory.allRoomsSurveyed) {
        Memory.gameState.scoutingComplete = true;
    }
    
    // Count available sources across all rooms
    let availableSources = 0;
    let totalSafeHarvestingSources = 0;
    
    if (Memory.rooms) {
        for (let roomName in Memory.rooms) {
            const roomMemory = Memory.rooms[roomName];
            if (roomMemory.sources && roomMemory.isSafeForHarvesting) {
                for (let sourceId in roomMemory.sources) {
                    // Count sources that are safe to harvest
                    totalSafeHarvestingSources++;
                    
                    // Count sources with reasonable round trip times (less than 300)
                    const source = roomMemory.sources[sourceId];
                    if (source.roundTripTime && source.roundTripTime < 300) {
                        availableSources++;
                    } else if (!source.isRemote) {
                        // Local sources are always available
                        availableSources++;
                    }
                }
            }
        }
    }
    
    // Update game state with available sources
    Memory.gameState.availableSources = availableSources;
    
    // Detect when scouting is complete and make a decision about expansion mode
    if (Memory.gameState.scoutingComplete && 
        !Memory.gameState.expansionDecisionMade) {
        
        console.log(`Scouting complete. Available safe sources: ${availableSources}`);
        
        // Determine if we can scale or need to cap
        if (availableSources < 2) {
            Memory.gameState.expansionMode = 'capped';
            console.log('EXPANSION MODE SET: CAPPED - Limited resources available');
        } else {
            Memory.gameState.expansionMode = 'scaling';
            console.log('EXPANSION MODE SET: SCALING - Sufficient resources available');
        }
        
        Memory.gameState.expansionDecisionMade = true;
    }
    
    // Find sources in the first room
    const firstRoom = Game.spawns['Spawn1'].room;
    const sources = firstRoom.find(FIND_SOURCES);
    const sourceCount = sources.length;
    
    // Calculate available mining spots for each source
    let totalMiningSpots = 0;
    sources.forEach(source => {
        // Initialize sources memory if it doesn't exist
        if (!Memory.sources) Memory.sources = {};
        if (!Memory.sources[source.id]) Memory.sources[source.id] = {};
        
        // Only calculate if we haven't done so already
        if (!Memory.sources[source.id].miningPositions) {
            // Look at a 3x3 area around the source
            let area = source.room.lookAtArea(
                Math.max(0, source.pos.y - 1),
                Math.max(0, source.pos.x - 1),
                Math.min(49, source.pos.y + 1),
                Math.min(49, source.pos.x + 1),
                true
            );
            
            // Filter for walkable positions and store them
            const walkablePositions = [];
            area.forEach(pos => {
                // Skip the source position
                if (pos.x === source.pos.x && pos.y === source.pos.y) return;
                
                // Check if this position has terrain
                if (pos.type === 'terrain' && pos.terrain === 'wall') return;
                
                // Check if position already has a blocking structure
                if (pos.type === 'structure' && 
                    pos.structure.structureType !== STRUCTURE_ROAD && 
                    pos.structure.structureType !== STRUCTURE_CONTAINER &&
                    pos.structure.structureType !== STRUCTURE_RAMPART) return;
                
                // This is a valid mining position
                // Use a key to deduplicate
                if (!walkablePositions.some(p => p.x === pos.x && p.y === pos.y)) {
                    walkablePositions.push({x: pos.x, y: pos.y});
                }
            });
            
            // Store the positions in memory
            Memory.sources[source.id].miningPositions = walkablePositions;
            Memory.sources[source.id].miningSpots = walkablePositions.length;
            console.log(`Source ${source.id} has ${walkablePositions.length} miningSpots`);
        }
        
        // Add to our total
        totalMiningSpots += Memory.sources[source.id].miningSpots;
    });
    
    console.log(`Total mining spots across all sources: ${totalMiningSpots}`);
    
    // Get counts for creeps of each role
    var harvesters = _.filter(Game.creeps, (creep) => creep.memory.role == 'harvester');
    var upgraders = _.filter(Game.creeps, (creep) => creep.memory.role == 'upgrader');
    var haulers = _.filter(Game.creeps, (creep) => creep.memory.role == 'hauler');
    var scouts = _.filter(Game.creeps, (creep) => creep.memory.role == 'scout');
    
    // Calculate desired number of harvesters - 3x max per source
    let desiredHarvesters = 0;
    for (let sourceId in Memory.sources) {
        const sourceMemory = Memory.sources[sourceId];
        const idealHarvestersForSource = Math.min(sourceMemory.miningSpots, 3);
        desiredHarvesters += idealHarvestersForSource;
    }
    
    // If we have no sources in memory yet, log a warning and use default
    if (desiredHarvesters === 0) {
        console.log('⚠️ WARNING: No sources found in memory. Using default harvester count of 3.');
        desiredHarvesters = 3; // Default until we discover sources
    }
    
    // Calculate desired haulers - 2x the number of harvesters
    const desiredHaulers = harvesters.length * 2;
    
    // Calculate desired number of scouts based on upgraders (1 per 4 upgraders)
    // Plus an initial scout after first hauler
    let desiredScouts = Math.floor(upgraders.length / 4);
    
    // Account for the initial scout
    if (haulers.length > 0 && !Memory.gameState.initialScoutSpawned) {
        desiredScouts += 1;
    }
    
    // Smart upgrader calculation based on the expansion mode
    let desiredUpgraders;
    
    if (Memory.gameState.expansionMode === 'scaling') {
        // CASE 1: Scaling mode
        if (harvesters.length >= 4) {
            // Once we have 4 harvesters, start with 4 upgraders
            // and then maintain 1:1 ratio thereafter
            desiredUpgraders = Math.max(4, harvesters.length);
        } else {
            // Still focusing on harvesters
            desiredUpgraders = 0;
        }
    } else {
        // CASE 2: Capped mode - focus on upgraders when all sources are taken
        const totalMiningPositions = _.sum(Memory.sources, source => Math.min(source.miningSpots, 3));
        
        if (harvesters.length >= totalMiningPositions * 0.75) {
            // We've filled most available harvester positions, focus on upgraders
            desiredUpgraders = Math.max(1, harvesters.length * 2); // More aggressive upgrader production
        } else {
            // Still need harvesters
            desiredUpgraders = 0;
        }
    }
    
    console.log(`Current creeps: ${harvesters.length}/${desiredHarvesters} harvesters, ` + 
                `${haulers.length}/${desiredHaulers} haulers, ` + 
                `${upgraders.length}/${desiredUpgraders} upgraders, ` +
                `${scouts.length}/${desiredScouts} scouts`);
    console.log(`Expansion mode: ${Memory.gameState.expansionMode}, Available sources: ${Memory.gameState.availableSources}`);
    
    // Initialize spawn sequence memory if it doesn't exist
    if (!Memory.spawnSequence) {
        Memory.spawnSequence = {
            lastSpawnType: null,
            harvesterCount: 0,
            haulerCount: 0,
            upgraderCount: 0,
            scoutCount: 0,
            initialScoutSpawned: false,
            lastUpgraderBeforeScout: 0 // Track upgraders before scout
        };
    }
    
    // Spawn priority logic with alternating pattern
    let spawnPriority = null;
    
    // Emergency case: Always have at least one harvester first
    if (harvesters.length === 0) {
        spawnPriority = 'harvester';
        Memory.spawnSequence.lastSpawnType = 'harvester';
        Memory.spawnSequence.harvesterCount++;
    }
    // Initial hauler
    else if (haulers.length === 0) {
        spawnPriority = 'hauler';
        Memory.spawnSequence.lastSpawnType = 'hauler';
        Memory.spawnSequence.haulerCount++;
    }
    // Initial scout after first hauler
    else if (!Memory.spawnSequence.initialScoutSpawned) {
        spawnPriority = 'scout';
        Memory.spawnSequence.lastSpawnType = 'scout';
        Memory.spawnSequence.scoutCount++;
        Memory.spawnSequence.initialScoutSpawned = true;
        Memory.gameState.initialScoutSpawned = true;
    }
    // Alternating pattern for harvester/hauler priority
    else {
        // Calculate the total number of alternate spawns we've done
        const totalAlternateSpawns = Memory.spawnSequence.harvesterCount + Memory.spawnSequence.haulerCount;
        
        // Harvester/Hauler priority - aim for 1:2 ratio with alternating pattern
        if (harvesters.length < desiredHarvesters || haulers.length < desiredHaulers) {
            // If last spawn was hauler, and we need harvesters, spawn harvester
            if (Memory.spawnSequence.lastSpawnType === 'hauler' && harvesters.length < desiredHarvesters) {
                spawnPriority = 'harvester';
                Memory.spawnSequence.lastSpawnType = 'harvester';
                Memory.spawnSequence.harvesterCount++;
            }
            // If last spawn was harvester or scout, spawn hauler (to maintain 1:2 ratio)
            else if ((Memory.spawnSequence.lastSpawnType === 'harvester' || 
                     Memory.spawnSequence.lastSpawnType === 'scout' || 
                     Memory.spawnSequence.lastSpawnType === 'upgrader') && 
                     haulers.length < desiredHaulers) {
                spawnPriority = 'hauler';
                Memory.spawnSequence.lastSpawnType = 'hauler';
                Memory.spawnSequence.haulerCount++;
            }
            // If we still need haulers but last spawn was also hauler, check if we should spawn harvester
            else if (haulers.length < desiredHaulers && Memory.spawnSequence.lastSpawnType === 'hauler') {
                // After two consecutive haulers, try to spawn a harvester if needed
                if (harvesters.length < desiredHarvesters && 
                    Memory.spawnSequence.haulerCount % 2 === 0) {
                    spawnPriority = 'harvester';
                    Memory.spawnSequence.lastSpawnType = 'harvester';
                    Memory.spawnSequence.harvesterCount++;
                } else {
                    spawnPriority = 'hauler';
                    Memory.spawnSequence.lastSpawnType = 'hauler';
                    Memory.spawnSequence.haulerCount++;
                }
            }
            // Fallback to ensure we always choose something if needed
            else if (harvesters.length < desiredHarvesters) {
                spawnPriority = 'harvester';
                Memory.spawnSequence.lastSpawnType = 'harvester';
                Memory.spawnSequence.harvesterCount++;
            } 
            else if (haulers.length < desiredHaulers) {
                spawnPriority = 'hauler';
                Memory.spawnSequence.lastSpawnType = 'hauler';
                Memory.spawnSequence.haulerCount++;
            }
        }
        // Once harvester/hauler needs are met, handle upgraders and scouts
        else if (upgraders.length < desiredUpgraders || scouts.length < desiredScouts) {
            // Track when we've spawned 4 upgraders in a row
            if (Memory.spawnSequence.lastSpawnType === 'upgrader') {
                Memory.spawnSequence.lastUpgraderBeforeScout++;
            } else {
                Memory.spawnSequence.lastUpgraderBeforeScout = 0;
            }
            
            // After every 4 upgraders, spawn a scout if needed
            if (Memory.spawnSequence.lastUpgraderBeforeScout >= 4 && scouts.length < desiredScouts) {
                spawnPriority = 'scout';
                Memory.spawnSequence.lastSpawnType = 'scout';
                Memory.spawnSequence.scoutCount++;
                Memory.spawnSequence.lastUpgraderBeforeScout = 0;
            }
            // Otherwise, spawn upgraders
            else if (upgraders.length < desiredUpgraders) {
                spawnPriority = 'upgrader';
                Memory.spawnSequence.lastSpawnType = 'upgrader';
                Memory.spawnSequence.upgraderCount++;
            }
            // If we need scouts but not exactly after 4 upgraders
            else if (scouts.length < desiredScouts) {
                spawnPriority = 'scout';
                Memory.spawnSequence.lastSpawnType = 'scout';
                Memory.spawnSequence.scoutCount++;
            }
        }
        // Default case for capped mode - just keep adding upgraders
        else if (Memory.gameState.expansionMode === 'capped') {
            spawnPriority = 'upgrader';
            Memory.spawnSequence.lastSpawnType = 'upgrader';
            Memory.spawnSequence.upgraderCount++;
        }
    }
    
    // Debug logging for spawn sequence
    console.log(`Spawn sequence stats - Last: ${Memory.spawnSequence.lastSpawnType}, ` +
                `H:${Memory.spawnSequence.harvesterCount}, ` +
                `Ha:${Memory.spawnSequence.haulerCount}, ` +
                `U:${Memory.spawnSequence.upgraderCount}, ` +
                `S:${Memory.spawnSequence.scoutCount}, ` +
                `UBS:${Memory.spawnSequence.lastUpgraderBeforeScout}`);

    
    // Spawn the creep based on priority
    if (spawnPriority !== null) {
        var newName = spawnPriority.charAt(0).toUpperCase() + spawnPriority.slice(1) + Game.time;
        
        if (spawnPriority === 'harvester') {
            Game.spawns['Spawn1'].spawnCreep([WORK, WORK, MOVE], newName, { 
                memory: { role: 'harvester' } 
            });
        }
        else if (spawnPriority === 'hauler') {
            Game.spawns['Spawn1'].spawnCreep([CARRY, CARRY, CARRY, MOVE, MOVE, MOVE], newName, { 
                memory: { role: 'hauler' } 
            });
        }
        else if (spawnPriority === 'upgrader') {
            Game.spawns['Spawn1'].spawnCreep([WORK, CARRY, CARRY, MOVE], newName, { 
                memory: { role: 'upgrader', working: false } 
            });
        }
        else if (spawnPriority === 'scout') {
            Game.spawns['Spawn1'].spawnCreep([MOVE, MOVE, MOVE], newName, { 
                memory: { 
                    role: 'scout',
                    homeRoom: Game.spawns['Spawn1'].room.name
                } 
            });
        }
    }
    
    // If the spawn is spawning a creep
    if (Game.spawns['Spawn1'].spawning) {
        // Get the creep being spawned
        var spawningCreep = Game.creeps[Game.spawns['Spawn1'].spawning.name];
        
        // Visualize the role of the spawning creep above the spawn
        Game.spawns['Spawn1'].room.visual.text(
            spawningCreep.memory.role,
            Game.spawns['Spawn1'].pos.x + 1,
            Game.spawns['Spawn1'].pos.y,
            { align: 'left', opacity: 0.8 });
    }
    
    // Run creep roles
    for (var creepName in Game.creeps) {
        var creep = Game.creeps[creepName];
        
        if (creep.memory.role == 'harvester') {
            roleHarvester.run(creep);
        }
        else if (creep.memory.role == 'upgrader') {
            roleUpgrader.run(creep);
        }
        else if (creep.memory.role == 'hauler') {
            roleHauler.run(creep);
        }
        else if (creep.memory.role == 'scout') {
            roleScout.run(creep);
        }
    }
};