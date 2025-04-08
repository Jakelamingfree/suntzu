// Simplified main.js for bootstrapping a new room
module.exports.loop = function () {
    // Memory cleanup - remove dead creeps
    for(var name in Memory.creeps) {
        if(!Game.creeps[name]) {
            delete Memory.creeps[name];
            console.log('Clearing non-existing creep memory:', name);
        }
    }

    // Count creeps by role
    var harvesters = _.filter(Game.creeps, (creep) => creep.memory.role == 'harvester');
    var haulers = _.filter(Game.creeps, (creep) => creep.memory.role == 'hauler');
    var upgraders = _.filter(Game.creeps, (creep) => creep.memory.role == 'upgrader');
    var builders = _.filter(Game.creeps, (creep) => creep.memory.role == 'builder');

    // Log current population
    console.log('Harvesters: ' + harvesters.length + ', Haulers: ' + haulers.length + 
                ', Upgraders: ' + upgraders.length + ', Builders: ' + builders.length);

    // Get first spawn in the room (to handle rooms with custom spawn names)
    var spawn = Object.values(Game.spawns)[0];
    if(!spawn) {
        console.log("ERROR: No spawn found!");
        return;
    }
    
    console.log("Using spawn: " + spawn.name + " in room " + spawn.room.name);
    console.log("Energy available: " + spawn.room.energyAvailable + "/" + spawn.room.energyCapacityAvailable);

    // Determine what to spawn next
    var nextRole = '';
    
    if(harvesters.length < 1) {
        // First priority: get at least one harvester
        nextRole = 'harvester';
    } else if(haulers.length < 2) {
        // Second priority: get haulers
        nextRole = 'hauler';
    } else if(harvesters.length < 2) {
        // Third priority: get a harvester for each source (up to 2)
        nextRole = 'harvester';
    } else if(upgraders.length < 1) {
        // Fourth priority: get an upgrader
        nextRole = 'upgrader';
    } else if(haulers.length < 3) {
        // Fifth priority: get one more hauler
        nextRole = 'hauler';
    } else if(builders.length < 1 && spawn.room.find(FIND_CONSTRUCTION_SITES).length > 0) {
        // If there are construction sites, get a builder
        nextRole = 'builder';
    } else {
        // Default: get more upgraders
        nextRole = 'upgrader';
    }
    
    console.log("Next role to spawn: " + nextRole);

    // Only try to spawn if we're not already spawning
    if(!spawn.spawning) {
        var energyAvailable = spawn.room.energyAvailable;
        
        // Spawn the creep based on role
        switch(nextRole) {
            case 'harvester':
                // Design harvester based on available energy
                var body = [];
                if(energyAvailable >= 550) {
                    body = [WORK,WORK,WORK,WORK,CARRY,MOVE,MOVE]; // 550 energy
                } else if(energyAvailable >= 400) {
                    body = [WORK,WORK,WORK,CARRY,MOVE]; // 400 energy
                } else if(energyAvailable >= 300) {
                    body = [WORK,WORK,CARRY,MOVE]; // 300 energy
                } else if(energyAvailable >= 250) {
                    body = [WORK,CARRY,MOVE,MOVE]; // 250 energy
                }
                
                if(body.length > 0) {
                    var name = 'Harvester' + Game.time;
                    console.log('Attempting to spawn harvester: ' + name + ' with body: ' + body);
                    var result = spawn.spawnCreep(body, name, {
                        memory: { role: 'harvester' }
                    });
                    console.log('Spawn result: ' + result);
                }
                break;
                
            case 'hauler':
                // Design hauler based on available energy
                var body = [];
                if(energyAvailable >= 400) {
                    body = [CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE]; // 400 energy
                } else if(energyAvailable >= 300) {
                    body = [CARRY,CARRY,CARRY,MOVE,MOVE,MOVE]; // 300 energy
                } else if(energyAvailable >= 200) {
                    body = [CARRY,CARRY,MOVE,MOVE]; // 200 energy
                }
                
                if(body.length > 0) {
                    var name = 'Hauler' + Game.time;
                    console.log('Attempting to spawn hauler: ' + name + ' with body: ' + body);
                    var result = spawn.spawnCreep(body, name, {
                        memory: { role: 'hauler', delivering: false }
                    });
                    console.log('Spawn result: ' + result);
                }
                break;
                
            case 'upgrader':
                // Design upgrader based on available energy
                var body = [];
                if(energyAvailable >= 500) {
                    body = [WORK,WORK,WORK,CARRY,CARRY,MOVE,MOVE]; // 500 energy
                } else if(energyAvailable >= 350) {
                    body = [WORK,WORK,CARRY,CARRY,MOVE]; // 350 energy
                } else if(energyAvailable >= 300) {
                    body = [WORK,WORK,CARRY,MOVE]; // 300 energy
                } else if(energyAvailable >= 200) {
                    body = [WORK,CARRY,MOVE]; // 200 energy
                }
                
                if(body.length > 0) {
                    var name = 'Upgrader' + Game.time;
                    console.log('Attempting to spawn upgrader: ' + name + ' with body: ' + body);
                    var result = spawn.spawnCreep(body, name, {
                        memory: { role: 'upgrader' }
                    });
                    console.log('Spawn result: ' + result);
                }
                break;
                
            case 'builder':
                // Design builder based on available energy
                var body = [];
                if(energyAvailable >= 500) {
                    body = [WORK,WORK,WORK,CARRY,CARRY,MOVE,MOVE]; // 500 energy
                } else if(energyAvailable >= 350) {
                    body = [WORK,WORK,CARRY,CARRY,MOVE]; // 350 energy
                } else if(energyAvailable >= 300) {
                    body = [WORK,WORK,CARRY,MOVE]; // 300 energy
                } else if(energyAvailable >= 200) {
                    body = [WORK,CARRY,MOVE]; // 200 energy
                }
                
                if(body.length > 0) {
                    var name = 'Builder' + Game.time;
                    console.log('Attempting to spawn builder: ' + name + ' with body: ' + body);
                    var result = spawn.spawnCreep(body, name, {
                        memory: { role: 'builder' }
                    });
                    console.log('Spawn result: ' + result);
                }
                break;
        }
    }

    // Display indicator when spawning
    if(spawn.spawning) { 
        var spawningCreep = Game.creeps[spawn.spawning.name];
        spawn.room.visual.text(
            '🛠️' + spawningCreep.memory.role,
            spawn.pos.x + 1, 
            spawn.pos.y, 
            {align: 'left', opacity: 0.8});
    }

    // Simple creep logic for bootstrap phase
    for(var name in Game.creeps) {
        var creep = Game.creeps[name];
        
        // Basic harvester logic
        if(creep.memory.role == 'harvester') {
            if(creep.store.getFreeCapacity() > 0) {
                var sources = creep.room.find(FIND_SOURCES);
                if(creep.harvest(sources[0]) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(sources[0], {visualizePathStyle: {stroke: '#ffaa00'}});
                }
            }
            else {
                // If containers exist, use them, otherwise drop energy
                var containers = creep.pos.findInRange(FIND_STRUCTURES, 1, {
                    filter: s => s.structureType == STRUCTURE_CONTAINER
                });
                
                if(containers.length > 0) {
                    // Standing on container, energy automatically goes in
                    creep.harvest(creep.pos.findClosestByRange(FIND_SOURCES));
                } else {
                    // Drop energy for haulers
                    creep.drop(RESOURCE_ENERGY);
                }
            }
        }
        // Basic hauler logic
        else if(creep.memory.role == 'hauler') {
            if(creep.memory.delivering && creep.store[RESOURCE_ENERGY] == 0) {
                creep.memory.delivering = false;
                creep.say('🔄 collect');
            }
            if(!creep.memory.delivering && creep.store.getFreeCapacity() == 0) {
                creep.memory.delivering = true;
                creep.say('📦 deliver');
            }

            if(creep.memory.delivering) {
                // Find closest structure that needs energy
                var target = creep.pos.findClosestByPath(FIND_STRUCTURES, {
                    filter: (structure) => {
                        return (
                            (structure.structureType == STRUCTURE_EXTENSION ||
                             structure.structureType == STRUCTURE_SPAWN) &&
                            structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
                        );
                    }
                });
                
                if(!target) {
                    // If no spawns/extensions need energy, try upgrading
                    if(creep.upgradeController(creep.room.controller) == ERR_NOT_IN_RANGE) {
                        creep.moveTo(creep.room.controller, {visualizePathStyle: {stroke: '#ffffff'}});
                    }
                } else {
                    if(creep.transfer(target, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                        creep.moveTo(target, {visualizePathStyle: {stroke: '#ffffff'}});
                    }
                }
            }
            else {
                // Find dropped resources or harvest directly
                var droppedResource = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES);
                if(droppedResource) {
                    if(creep.pickup(droppedResource) == ERR_NOT_IN_RANGE) {
                        creep.moveTo(droppedResource, {visualizePathStyle: {stroke: '#ffaa00'}});
                    }
                } else {
                    // No dropped resources, harvest directly
                    var sources = creep.room.find(FIND_SOURCES);
                    if(creep.harvest(sources[0]) == ERR_NOT_IN_RANGE) {
                        creep.moveTo(sources[0], {visualizePathStyle: {stroke: '#ffaa00'}});
                    }
                }
            }
        }
        // Basic upgrader logic
        else if(creep.memory.role == 'upgrader') {
            if(creep.memory.upgrading && creep.store[RESOURCE_ENERGY] == 0) {
                creep.memory.upgrading = false;
                creep.say('🔄 collect');
            }
            if(!creep.memory.upgrading && creep.store.getFreeCapacity() == 0) {
                creep.memory.upgrading = true;
                creep.say('⚡ upgrade');
            }

            if(creep.memory.upgrading) {
                if(creep.upgradeController(creep.room.controller) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(creep.room.controller, {visualizePathStyle: {stroke: '#ffffff'}});
                }
            }
            else {
                // Find dropped resources first
                var droppedResource = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES);
                if(droppedResource) {
                    if(creep.pickup(droppedResource) == ERR_NOT_IN_RANGE) {
                        creep.moveTo(droppedResource, {visualizePathStyle: {stroke: '#ffaa00'}});
                    }
                } else {
                    // No dropped resources, harvest directly
                    var sources = creep.room.find(FIND_SOURCES);
                    if(creep.harvest(sources[0]) == ERR_NOT_IN_RANGE) {
                        creep.moveTo(sources[0], {visualizePathStyle: {stroke: '#ffaa00'}});
                    }
                }
            }
        }
        // Basic builder logic
        else if(creep.memory.role == 'builder') {
            if(creep.memory.building && creep.store[RESOURCE_ENERGY] == 0) {
                creep.memory.building = false;
                creep.say('🔄 collect');
            }
            if(!creep.memory.building && creep.store.getFreeCapacity() == 0) {
                creep.memory.building = true;
                creep.say('🚧 build');
            }

            if(creep.memory.building) {
                var targets = creep.room.find(FIND_CONSTRUCTION_SITES);
                if(targets.length) {
                    if(creep.build(targets[0]) == ERR_NOT_IN_RANGE) {
                        creep.moveTo(targets[0], {visualizePathStyle: {stroke: '#ffffff'}});
                    }
                } else {
                    // No construction sites - help with upgrading
                    if(creep.upgradeController(creep.room.controller) == ERR_NOT_IN_RANGE) {
                        creep.moveTo(creep.room.controller, {visualizePathStyle: {stroke: '#ffffff'}});
                    }
                }
            }
            else {
                // Find dropped resources first
                var droppedResource = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES);
                if(droppedResource) {
                    if(creep.pickup(droppedResource) == ERR_NOT_IN_RANGE) {
                        creep.moveTo(droppedResource, {visualizePathStyle: {stroke: '#ffaa00'}});
                    }
                } else {
                    // No dropped resources, harvest directly
                    var sources = creep.room.find(FIND_SOURCES);
                    if(creep.harvest(sources[0]) == ERR_NOT_IN_RANGE) {
                        creep.moveTo(sources[0], {visualizePathStyle: {stroke: '#ffaa00'}});
                    }
                }
            }
        }
    }
};