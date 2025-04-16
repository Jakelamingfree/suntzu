// Import creep roles

var roleHarvester = require('role.harvester');
var roleUpgrader = require('role.upgrader');
const roleHauler = require('role.hauler');

// This function runs every tick
module.exports.loop = function() {
    // Loop through each creep's name in Memory.creeps
    for (var creepName in Memory.creeps) {
        // If the creep's name isn't in Game.creeps
        if (!Game.creeps[creepName]) {
            // Remove it from the memory and log that it did so
            delete Memory.creeps[creepName];
            console.log('Clearing non-existing creep memory:', creepName);
        }
    }
    // Find sources in the first room
    const firstRoom = Game.spawns['Spawn1'].room
    const sources = firstRoom.find(FIND_SOURCES);
    const sourceCount = sources.length;
    console.log(`Found ${sourceCount} sources in room ${firstRoom.name}`);

    // Calculate available mining spots for each source
    let totalMiningSpots = 0;
    sources.forEach(source => {
        // Initialize sources memory if it doesn't exist
        if (!Memory.sources) Memory.sources = {};
        if (!Memory.sources[source.id]) Memory.sources[source.id] = {};

        // Only calculate if we haven't done so already
        if(!Memory.sources[source.id].miningPositions) {
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
                if(pos.type === 'terrain' && pos.terrain === 'wall') return;
                
                
                // Check if position already has a blocking structure
                if (pos.type === 'structure' && 
                    pos.structure.structureType !== STRUCTURE_ROAD && 
                    pos.structure.structureType !== STRUCTURE_CONTAINER &&
                    pos.structure.structureType !== STRUCTURE_RAMPART) return;
            
                
                // This is a valid mining position
                // Use a key to deduplicate
                const posKey = `${pos.x},${pos.y}`;
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

    // Smart upgrader calculation that works even with limited harvester positions
    const totalMiningPositions = _.sum(Memory.sources, source => Math.min(source.miningSpots, 3));

    // Ensure we spawn upgraders even in limited harvester scenarios
    let desiredUpgraders;
    if (harvesters.length >= 5) {
        // Normal case - one upgrader per harvester
        desiredUpgraders = harvesters.length;
    } else if (harvesters.length >= totalMiningPositions * 0.75) {
        // We've filled most available harvester positions, start spawning upgraders
        desiredUpgraders = Math.max(1, Math.floor(harvesters.length / 2));
    } else {
        // Still focusing on harvesters
        desiredUpgraders = 0;
    }

    console.log(`Current creeps: ${harvesters.length}/${desiredHarvesters} harvesters, ${haulers.length}/${desiredHaulers} haulers, ${upgraders.length}/${desiredUpgraders} upgraders`);

    
    // If there aren't enough harvesters (FIXED: using comparison == instead of assignment =)
    if (harvesters.length < desiredHarvesters) {
        var newName = 'Harvester' + Game.time;
        Game.spawns['Spawn1'].spawnCreep([WORK, WORK, MOVE], newName, { memory: { role: 'harvester' } });
    }
    // Otherwise if there aren't enough haulers
    else if (haulers.length < desiredHaulers) {
        var newName = 'Hauler' + Game.time;
        Game.spawns['Spawn1'].spawnCreep([CARRY, CARRY, CARRY, MOVE, MOVE, MOVE], newName, { memory: { role: 'hauler' } });
    }
    // Otherwise if there aren't enough upgraders
    else if (upgraders.length < desiredUpgraders) {
        // Spawn a new one
        var newName = 'Upgrader' + Game.time;
        Game.spawns['Spawn1'].spawnCreep([WORK, CARRY, CARRY, MOVE], newName, { memory: { role: 'upgrader', upgrading: false } });
    }
    // If the spawn is spawning a creep
    if (Game.spawns['Spawn1'].spawning) {
        // Get the creep being spawned
        var spawningCreep = Game.creeps[Game.spawns['Spawn1'].spawning.name]

        // Visualize the role of the spawning creep above the spawn
        Game.spawns['Spawn1'].room.visual.text(
            spawningCreep.memory.role,
            Game.spawns['Spawn1'].pos.x + 1,
            Game.spawns['Spawn1'].pos.y,
            { align: 'left', opacity: 0.8 });
    }

    // Loop through creep's names in Game.creeps and run their role
    for (var creepName in Game.creeps) {
        var creep = Game.creeps[creepName]

        if (creep.memory.role == 'harvester') {
            roleHarvester.run(creep);
            continue
        }
        if (creep.memory.role == 'upgrader') {
            roleUpgrader.run(creep);
            continue
        }
        if (creep.memory.role == 'hauler') {
            roleHauler.run(creep);
            continue
        }
    }
}