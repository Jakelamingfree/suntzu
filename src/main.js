// Import role modules
var roleHarvester = require('harvester');
var roleUpgrader = require('upgrader');
var roleBuilder = require('builder');
var roleHauler = require('hauler');

module.exports.loop = function () {
    Game.spawns['Spawn1'].room.visual.text(
        'Tick: ' + Game.time,
        25, 25, 
        {color: 'white', font: 0.8, stroke: 'black', strokeWidth: 0.5}
    );
    
    // CPU Diagnostics
    const startCpu = Game.cpu.getUsed();
    console.log(`Tick ${Game.time} starting. CPU: ${startCpu.toFixed(2)}/${Game.cpu.limit}, Bucket: ${Game.cpu.bucket}`);
    
    // Track timing of different sections
    let cpuTracker = {
        memoryCleanup: 0,
        creepCounting: 0,
        populationCalc: 0,
        spawning: 0,
        creepControl: 0
    };
    
    try {
        // Memory cleanup - track CPU
        const memoryStartCpu = Game.cpu.getUsed();
        for(var name in Memory.creeps) {
            if(!Game.creeps[name]) {
                delete Memory.creeps[name];
                console.log('Clearing non-existing creep memory:', name);
            }
        }
        cpuTracker.memoryCleanup = Game.cpu.getUsed() - memoryStartCpu;

        // Count creeps by role - track CPU
        const countStartCpu = Game.cpu.getUsed();
        var harvesters = _.filter(Game.creeps, (creep) => creep.memory.role == 'harvester');
        var upgraders = _.filter(Game.creeps, (creep) => creep.memory.role == 'upgrader');
        var builders = _.filter(Game.creeps, (creep) => creep.memory.role == 'builder');
        var haulers = _.filter(Game.creeps, (creep) => creep.memory.role == 'hauler');
        cpuTracker.creepCounting = Game.cpu.getUsed() - countStartCpu;

        // Population calculation - track CPU
        const popCalcStartCpu = Game.cpu.getUsed();
        
        // Define minimum populations based on colony stage
        var sources = Game.spawns['Spawn1'].room.find(FIND_SOURCES);
        // For each source, allocate optimal number of harvesters based on open spaces
        var minHarvesters = 0;
        for(var i = 0; i < sources.length; i++) {
            var source = sources[i];
            // Count free spaces around this source
            var terrain = Game.map.getRoomTerrain(source.room.name);
            var freeSpaces = 0;
            
            for(var dx = -1; dx <= 1; dx++) {
                for(var dy = -1; dy <= 1; dy++) {
                    // Skip the source itself
                    if(dx == 0 && dy == 0) continue;
                    
                    var x = source.pos.x + dx;
                    var y = source.pos.y + dy;
                    
                    // Make sure position is inside room bounds
                    if(x < 1 || x > 48 || y < 1 || y > 48) continue;
                    
                    // Count non-wall spaces
                    if(terrain.get(x, y) !== TERRAIN_MASK_WALL) {
                        freeSpaces++;
                    }
                }
            }
            
            // Add harvesters for this source (minimum 1, maximum based on free spaces)
            minHarvesters += Math.min(2, Math.max(1, freeSpaces));
        }
        
        // Set hauler count based on harvester count
        var minHaulers = Math.max(2, Math.ceil(minHarvesters * 1.5)); // 1.5 haulers per harvester, minimum 2
        var minUpgraders = 1;
        var minBuilders = 1;

        // Adjust builder count based on construction sites
        var constructionSites = _.size(Game.constructionSites);
        if(constructionSites > 3) {
            minBuilders = 2;
        } else if(constructionSites == 0) {
            minBuilders = 0; // No need for builders if nothing to build
        }

        // Get energy info for spawning
        var energyAvailable = Game.spawns['Spawn1'].room.energyAvailable;
        var energyCapacity = Game.spawns['Spawn1'].room.energyCapacityAvailable;
        
        cpuTracker.populationCalc = Game.cpu.getUsed() - popCalcStartCpu;

        // Spawning logic - track CPU
        const spawnStartCpu = Game.cpu.getUsed();
        
        // Only spawn if we're not already spawning
        if(!Game.spawns['Spawn1'].spawning) {
            // Emergency mode: If we have no harvesters and no haulers, make a small one immediately
            if(harvesters.length == 0 && haulers.length == 0) {
                Game.spawns['Spawn1'].spawnCreep([WORK,CARRY,MOVE], 'Harvester'+Game.time, 
                    {memory: {role: 'harvester', number: harvesters.length}});
            }
            // Normal operations
            else if(energyAvailable >= 300) { // Basic creep cost
                // Priority order: Harvesters > Haulers > Upgraders > Builders
                if(harvesters.length < minHarvesters) {
                    var newName = 'Harvester' + Game.time;
                    console.log('Spawning new harvester: ' + newName);
                    
                    // Harvester design: lots of WORK, minimal CARRY/MOVE
                    var bodyParts = energyAvailable >= 550 ? 
                        [WORK,WORK,WORK,WORK,CARRY,MOVE] : 
                        [WORK,WORK,CARRY,MOVE];
                        
                    Game.spawns['Spawn1'].spawnCreep(bodyParts, newName, 
                        {memory: {role: 'harvester', number: harvesters.length}});
                }
                else if(haulers.length < minHaulers) {
                    var newName = 'Hauler' + Game.time;
                    console.log('Spawning new hauler: ' + newName);
                    
                    // Hauler design: balanced CARRY and MOVE, no WORK
                    var bodyParts = energyAvailable >= 550 ? 
                        [CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE] : 
                        [CARRY,CARRY,MOVE,MOVE];
                        
                    Game.spawns['Spawn1'].spawnCreep(bodyParts, newName,
                        {memory: {role: 'hauler'}});
                }
                else if(upgraders.length < minUpgraders) {
                    var newName = 'Upgrader' + Game.time;
                    console.log('Spawning new upgrader: ' + newName);
                    
                    var bodyParts = energyAvailable >= 550 ? 
                        [WORK,WORK,CARRY,CARRY,MOVE,MOVE,MOVE] : 
                        [WORK,CARRY,MOVE];
                        
                    Game.spawns['Spawn1'].spawnCreep(bodyParts, newName,
                        {memory: {role: 'upgrader'}});
                }
                else if(builders.length < minBuilders && constructionSites > 0) {
                    var newName = 'Builder' + Game.time;
                    console.log('Spawning new builder: ' + newName);
                    
                    var bodyParts = energyAvailable >= 550 ? 
                        [WORK,WORK,CARRY,CARRY,MOVE,MOVE,MOVE] : 
                        [WORK,CARRY,MOVE];
                        
                    Game.spawns['Spawn1'].spawnCreep(bodyParts, newName,
                        {memory: {role: 'builder'}});
                }
                // Optional: Create bigger/better creeps when we have excess energy
                else if(energyAvailable >= energyCapacity * 0.8) {
                    // Spawn additional upgraders when energy is abundant
                    var newName = 'Upgrader' + Game.time;
                    var bodyParts = [WORK,WORK,WORK,CARRY,CARRY,MOVE,MOVE,MOVE];
                    Game.spawns['Spawn1'].spawnCreep(bodyParts, newName,
                        {memory: {role: 'upgrader'}});
                }
            }
        }

        // Display visual indicator when spawning
        if(Game.spawns['Spawn1'].spawning) { 
            var spawningCreep = Game.creeps[Game.spawns['Spawn1'].spawning.name];
            Game.spawns['Spawn1'].room.visual.text(
                '🛠️' + spawningCreep.memory.role,
                Game.spawns['Spawn1'].pos.x + 1, 
                Game.spawns['Spawn1'].pos.y, 
                {align: 'left', opacity: 0.8});
        }
        
        cpuTracker.spawning = Game.cpu.getUsed() - spawnStartCpu;

        // Creep control logic - track CPU
        const creepControlStartCpu = Game.cpu.getUsed();
        
        // Run role logic for each creep with try-catch to catch individual errors
        for(var name in Game.creeps) {
            try {
                var creep = Game.creeps[name];
                if(creep.memory.role == 'harvester') {
                    roleHarvester.run(creep);
                }
                else if(creep.memory.role == 'upgrader') {
                    roleUpgrader.run(creep);
                }
                else if(creep.memory.role == 'builder') {
                    roleBuilder.run(creep);
                }
                else if(creep.memory.role == 'hauler') {
                    roleHauler.run(creep);
                }
                else {
                    console.log(`Creep ${name} has unknown role: ${creep.memory.role}`);
                }
            } catch(e) {
                console.log(`Error running creep ${name} with role ${creep.memory.role || 'unknown'}: ${e}`);
                console.log(`Stack trace: ${e.stack}`);
            }
        }
        
        cpuTracker.creepControl = Game.cpu.getUsed() - creepControlStartCpu;
        
    } catch(e) {
        console.log(`Major error in main loop: ${e}`);
        console.log(`Stack trace: ${e.stack}`);
    }
    
    // Log CPU usage at the end
    const endCpu = Game.cpu.getUsed();
    console.log(`Tick ${Game.time} ending. CPU Used: ${endCpu.toFixed(2)}/${Game.cpu.limit} ` +
                `(${((endCpu/Game.cpu.limit)*100).toFixed(0)}%)`);
    console.log(`CPU breakdown - Memory: ${cpuTracker.memoryCleanup.toFixed(2)}, ` +
                `Counting: ${cpuTracker.creepCounting.toFixed(2)}, ` +
                `Population: ${cpuTracker.populationCalc.toFixed(2)}, ` +
                `Spawning: ${cpuTracker.spawning.toFixed(2)}, ` +
                `Creep Control: ${cpuTracker.creepControl.toFixed(2)}`);
};