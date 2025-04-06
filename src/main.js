// Add this to your main.js loop
// First, clear memory of dead creeps
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

// Define minimum populations based on colony stage
var minHarvesters = 2;
var minUpgraders = 1;
var minBuilders = 1;

// Adjust builder count based on construction sites
var constructionSites = _.size(Game.constructionSites);
if(constructionSites > 3) {
    minBuilders = 2;
} else if(constructionSites == 0) {
    minBuilders = 0; // No need for builders if nothing to build
}

// Prioritize spawning creeps
var energyAvailable = Game.spawns['Spawn1'].room.energyAvailable;
var energyCapacity = Game.spawns['Spawn1'].room.energyCapacityAvailable;

// Only spawn if we're not already spawning
if(!Game.spawns['Spawn1'].spawning) {
    // Emergency mode: If we have no harvesters, make a small one immediately
    if(harvesters.length == 0) {
        Game.spawns['Spawn1'].spawnCreep([WORK,CARRY,MOVE], 'Harvester'+Game.time, 
            {memory: {role: 'harvester'}});
    }
    // Normal operations
    else if(energyAvailable >= 300) { // Basic creep cost
        // Priority order: Harvesters > Upgraders > Builders
        if(harvesters.length < minHarvesters) {
            var newName = 'Harvester' + Game.time;
            console.log('Spawning new harvester: ' + newName);
            
            // Bigger creeps when we can afford them
            var bodyParts = energyAvailable >= 550 ? 
                [WORK,WORK,CARRY,CARRY,MOVE,MOVE,MOVE] : 
                [WORK,CARRY,MOVE];
                
            Game.spawns['Spawn1'].spawnCreep(bodyParts, newName, 
                {memory: {role: 'harvester'}});
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