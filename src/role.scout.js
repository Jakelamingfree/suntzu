// Import creep roles
var roleHarvester = require('role.harvester');
var roleUpgrader = require('role.upgrader');
var roleHauler = require('role.hauler');
var roleScout = require('role.scout');

// This function runs every tick
module.exports.loop = function() {
    // Garbage collection: remove dead creeps from memory and track them
    for (var creepName in Memory.creeps) {
        if (!Game.creeps[creepName]) {
            // Track the type of creep that died for replacement
            const role = Memory.creeps[creepName].role;
            if (role) {
                if (!Memory.deadCreeps[role]) {
                    Memory.deadCreeps[role] = 0;
                }
                Memory.deadCreeps[role]++;
                console.log(`Creep died: ${role} (${creepName}). Queued for replacement.`);
            }
            
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
    let availableSafeSources = 0;
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
                        availableSafeSources++;
                    } else if (!source.isRemote) {
                        // Local sources are always available
                        availableSafeSources++;
                    }
                }
            }
        }
    }
    
    // Update game state with available sources
    Memory.gameState.availableSources = availableSafeSources;
    
    // Detect when scouting is complete and make a decision about expansion mode
    if (Memory.gameState.scoutingComplete && 
        !Memory.gameState.expansionDecisionMade) {
        
        console.log(`Scouting complete. Available safe sources: ${availableSafeSources}`);
        
        // Determine if we can scale or need to cap
        if (availableSafeSources < 2) {
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
    
    // Calculate desired number of harvesters - Max 2 per source from all available sources
    let desiredHarvesters = 0;
    let trackingSources = [];
    
    // First check sources in current room
    for (let sourceId in Memory.sources) {
        const sourceMemory = Memory.sources[sourceId];
        const idealHarvestersForSource = Math.min(sourceMemory.miningSpots, 2);
        desiredHarvesters += idealHarvestersForSource;
        trackingSources.push(sourceId);
    }
    
    // Then check for sources in scouted rooms that are safe and within 2 room radius
    if (Memory.rooms) {
        // Home room for reference
        const homeRoom = Game.spawns['Spawn1'].room.name;
        
        // First map out hostile rooms
        const hostileRooms = [];
        for (let roomName in Memory.rooms) {
            const roomMemory = Memory.rooms[roomName];
            if (roomMemory.hostiles && roomMemory.hostiles.count > 0) {
                hostileRooms.push(roomName);
            }
        }
        
        // Then look for safe rooms within 2 room distance
        for (let roomName in Memory.rooms) {
            // Skip current room as we already counted those sources
            if (roomName === homeRoom) continue;
            
            const roomMemory = Memory.rooms[roomName];
            // Only consider safe rooms
            if (!roomMemory.isSafeForHarvesting) continue;
            
            // Check if room is within 2 rooms of home
            const distance = Game.map.getRoomLinearDistance(homeRoom, roomName);
            if (distance > 2) continue;
            
            // Check if path goes through a hostile room
            const route = Game.map.findRoute(homeRoom, roomName);
            if (route === ERR_NO_PATH) continue;
            
            let pathThroughHostile = false;
            for (let i = 0; i < route.length; i++) {
                if (hostileRooms.includes(route[i].room)) {
                    pathThroughHostile = true;
                    break;
                }
            }
            
            if (pathThroughHostile) continue;
            
            // This room is valid - count its sources
            if (roomMemory.sources) {
                for (let sourceId in roomMemory.sources) {
                    // Skip if this source is already counted
                    if (trackingSources.includes(sourceId)) continue;
                    
                    const sourceMem = roomMemory.sources[sourceId];
                    const idealHarvestersForSource = Math.min(sourceMem.miningSpots || 1, 2);
                    desiredHarvesters += idealHarvestersForSource;
                    trackingSources.push(sourceId);
                }
            }
        }
    }
    
    // If we have no sources in memory yet, log a warning and use default
    if (desiredHarvesters === 0) {
        console.log('⚠️ WARNING: No sources found in memory. Using default harvester count of 2.');
        desiredHarvesters = 2; // Default until we discover sources
    }
    
    // Calculate desired haulers - simple 2:1 ratio to harvesters
    const desiredHaulers = harvesters.length * 2;
    
    // Calculate desired number of scouts based on total creep count
    // First scout after 3 creeps, then 1 more after every 10 creeps
    const totalCreeps = Object.keys(Game.creeps).length;
    let desiredScouts = 0;
    
    if (totalCreeps >= 3) {
        desiredScouts = 1 + Math.floor((totalCreeps - 3) / 10);
    }
    
    // Calculate desired upgraders - formula: 1 upgrader for 4 harvesters, 2 for 5 harvesters, etc.
    let desiredUpgraders = harvesters.length - 3;
    
    // Make sure we don't go negative
    desiredUpgraders = Math.max(0, desiredUpgraders);
    
    console.log(`Current creeps: ${harvesters.length}/${desiredHarvesters} harvesters, ` + 
                `${haulers.length}/${desiredHaulers} haulers, ` + 
                `${upgraders.length}/${desiredUpgraders} upgraders, ` +
                `${scouts.length}/${desiredScouts} scouts`);
    console.log(`Total creeps: ${Object.keys(Game.creeps).length}, Sources available: ${trackingSources.length}`);
    console.log(`Dead creeps awaiting replacement: H:${Memory.deadCreeps.harvester} Ha:${Memory.deadCreeps.hauler} U:${Memory.deadCreeps.upgrader} S:${Memory.deadCreeps.scout}`);
    console.log(`Expansion mode: ${Memory.gameState.expansionMode}, Safe sources: ${Memory.gameState.availableSources}`);
    
    // Initialize spawn sequence memory if it doesn't exist
    if (!Memory.spawnSequence) {
        Memory.spawnSequence = {
            lastSpawnType: null,
            totalSpawnCount: 0,
            deadCreepTypes: {} // Track types of creeps that have died
        };
    }
    
    // Track dead creeps from memory cleanup
    if (!Memory.deadCreeps) {
        Memory.deadCreeps = {
            harvester: 0,
            hauler: 0,
            upgrader: 0,
            scout: 0
        };
    }
    
    // Spawn priority logic
    let spawnPriority = null;
    
    // First priority: Replace any dead creeps
    if (Memory.deadCreeps.harvester > 0 && harvesters.length < desiredHarvesters) {
        spawnPriority = 'harvester';
        Memory.deadCreeps.harvester--;
    }
    else if (Memory.deadCreeps.hauler > 0 && haulers.length < desiredHaulers) {
        spawnPriority = 'hauler';
        Memory.deadCreeps.hauler--;
    }
    else if (Memory.deadCreeps.upgrader > 0 && upgraders.length < desiredUpgraders) {
        spawnPriority = 'upgrader';
        Memory.deadCreeps.upgrader--;
    }
    else if (Memory.deadCreeps.scout > 0 && scouts.length < desiredScouts) {
        spawnPriority = 'scout';
        Memory.deadCreeps.scout--;
    }
    // Emergency case: Always have at least one harvester
    else if (harvesters.length === 0) {
        spawnPriority = 'harvester';
    }
    // Scout priority - based on total creep count
    else if (scouts.length < desiredScouts) {
        // If we need scouts and have reached the required creep milestones, spawn a scout
        // First at 3 creeps, then at 13, 23, etc.
        const totalCreeps = Object.keys(Game.creeps).length;
        
        if ((totalCreeps >= 3 && scouts.length === 0) || 
            (totalCreeps >= 13 && scouts.length === 1) ||
            (totalCreeps >= 23 && scouts.length === 2) ||
            (totalCreeps >= 33 && scouts.length === 3)) {
            spawnPriority = 'scout';
        }
    }
    // Harvester/Hauler priority - maintain desired ratios
    else if (harvesters.length < desiredHarvesters || haulers.length < desiredHaulers) {
        // Need more harvesters
        if (harvesters.length < desiredHarvesters) {
            spawnPriority = 'harvester';
        }
        // Need more haulers, but maintain the 1:2 ratio
        else if (haulers.length < Math.min(desiredHaulers, harvesters.length * 2)) {
            spawnPriority = 'hauler';
        }
    }
    // Upgrader priority - once we have 4+ harvesters, spawn upgraders
    else if (harvesters.length >= 4 && upgraders.length < desiredUpgraders) {
        spawnPriority = 'upgrader';
    }
    // Default case - just keep adding upgraders if nothing else needed
    else if (upgraders.length < 20) { // Cap at a reasonable number
        spawnPriority = 'upgrader';
    }
    
    // Debug logging for spawn priority
    console.log(`Next spawn priority: ${spawnPriority || 'none'}, Total spawns: ${Memory.spawnSequence.totalSpawnCount}`);

    
    // Spawn the creep based on priority
    if (spawnPriority !== null) {
        var newName = spawnPriority.charAt(0).toUpperCase() + spawnPriority.slice(1) + Game.time;
        let spawnResult;
        
        if (spawnPriority === 'harvester') {
            spawnResult = Game.spawns['Spawn1'].spawnCreep([WORK, WORK, MOVE], newName, { 
                memory: { role: 'harvester' } 
            });
        }
        else if (spawnPriority === 'hauler') {
            spawnResult = Game.spawns['Spawn1'].spawnCreep([CARRY, CARRY, CARRY, MOVE, MOVE, MOVE], newName, { 
                memory: { role: 'hauler' } 
            });
        }
        else if (spawnPriority === 'upgrader') {
            spawnResult = Game.spawns['Spawn1'].spawnCreep([WORK, CARRY, CARRY, MOVE], newName, { 
                memory: { role: 'upgrader', working: false } 
            });
        }
        else if (spawnPriority === 'scout') {
            spawnResult = Game.spawns['Spawn1'].spawnCreep([MOVE, MOVE, MOVE], newName, { 
                memory: { 
                    role: 'scout',
                    homeRoom: Game.spawns['Spawn1'].room.name
                } 
            });
        }
        
        // If spawn was successful, update the spawn count
        if (spawnResult === OK) {
            Memory.spawnSequence.lastSpawnType = spawnPriority;
            Memory.spawnSequence.totalSpawnCount++;
            console.log(`🛠️ Spawning new ${spawnPriority}: ${newName}`);
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