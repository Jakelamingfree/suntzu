// Import role modules
var roleHarvester = require('role.harvester');
var roleUpgrader = require('role.upgrader');
var roleBuilder = require('role.builder');
var roleHauler = require('role.hauler');

module.exports.loop = function () {
    // Clear memory of dead creeps
    for(var name in Memory.creeps) {
        if(!Game.creeps[name]) {
            delete Memory.creeps[name];
            console.log('Clearing non-existing creep memory:', name);
        }
    }

    // Count creeps by role
    var harvesters = _.filter(Game.creeps, (creep) => creep.memory.role == 'harvester');
    var upgraders = _.filter(Game.creeps, (creep) => creep.memory.role == 'upgrader');
    var builders = _.filter(Game.creeps, (creep) => creep.memory.role == 'builder');
    var haulers = _.filter(Game.creeps, (creep) => creep.memory.role == 'hauler');

    // Define minimum populations based on colony stage
    var sources = Game.spawns['Spawn1'].room.find(FIND_SOURCES);
    var minHarvesters = sources.length; // One harvester per source
    var minHaulers = Math.max(1, Math.floor(minHarvesters * 1.5)); // 1.5 haulers per harvester
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

    // Run role logic for each creep
    for(var name in Game.creeps) {
        var creep = Game.creeps[name];
        if(creep.memory.role == 'harvester') {
            roleHarvester.run(creep);
        }
        if(creep.memory.role == 'upgrader') {
            roleUpgrader.run(creep);
        }
        if(creep.memory.role == 'builder') {
            roleBuilder.run(creep);
        }
        if(creep.memory.role == 'hauler') {
            roleHauler.run(creep);
        }
    }
};