// Import role modules
var roleHarvester = require('harvester');
var roleUpgrader = require('upgrader');
var roleBuilder = require('builder');
var roleHauler = require('hauler');
var moveCoordinator = require('moveCoordinator');

module.exports.loop = function () {
    // Initialize the movement coordinator at the start of each tick
    moveCoordinator.init();
    
    // Memory cleanup - remove dead creeps
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
    
    // Log current population
    console.log('Harvesters: ' + harvesters.length + ', Haulers: ' + haulers.length + 
                ', Upgraders: ' + upgraders.length + ', Builders: ' + builders.length);
    
    // Initialize the spawn queue if it doesn't exist
    if(!Memory.spawnQueue) {
        Memory.spawnQueue = {
            nextRole: '',
            harvesterCount: 0,
            haulerCount: 0
        };
    }
    
    // Get all sources in the room
    var sources = Game.spawns['Spawn1'].room.find(FIND_SOURCES);
    
    // Determine optimal creep counts
    // We want 1 harvester per source, and 2 haulers per harvester initially
    var optimalHarvesters = sources.length;
    
    // Calculate how many resource units our harvesters can produce
    // Each WORK part harvests 2 energy per tick
    var totalWorkParts = _.sum(harvesters, h => _.filter(h.body, part => part.type === WORK).length);
    var energyPerTick = Math.min(totalWorkParts * 2, sources.length * 10); // Max 10 energy/tick per source
    
    // Calculate hauler needs (roughly 2 haulers per active source initially)
    // Later we'll refine this based on actual energy production
    var optimalHaulers = Math.max(2, Math.ceil(energyPerTick / 5));
    
    // Decide what to spawn next based on our priorities
    // 1. First, ensure we have at least one harvester
    // 2. Then get 2 haulers
    // 3. Then get one harvester per source
    // 4. Then get optimal number of haulers
    // 5. Then get upgraders & builders
    if(harvesters.length === 0) {
        Memory.spawnQueue.nextRole = 'harvester';
    } else if(haulers.length < 2) {
        Memory.spawnQueue.nextRole = 'hauler';
    } else if(harvesters.length < optimalHarvesters) {
        Memory.spawnQueue.nextRole = 'harvester';
    } else if(haulers.length < optimalHaulers) {
        Memory.spawnQueue.nextRole = 'hauler';
    } else if(upgraders.length < 1) {
        Memory.spawnQueue.nextRole = 'upgrader';
    } else if(builders.length < 1 && Game.spawns['Spawn1'].room.find(FIND_CONSTRUCTION_SITES).length > 0) {
        Memory.spawnQueue.nextRole = 'builder';
    } else {
        // Default to adding more haulers for efficiency, then upgraders for long-term growth
        Memory.spawnQueue.nextRole = haulers.length < optimalHaulers + 2 ? 'hauler' : 'upgrader';
    }
    
    console.log('Next role to spawn: ' + Memory.spawnQueue.nextRole);
    console.log('Optimal counts - Harvesters: ' + optimalHarvesters + ', Haulers: ' + optimalHaulers);
    
    // Spawning logic
    var spawn = Game.spawns['Spawn1'];
    if(!spawn.spawning) {
        var energyAvailable = spawn.room.energyAvailable;
        var role = Memory.spawnQueue.nextRole;
        
        // Emergency mode: If we have no harvesters, make a small one immediately
        if(harvesters.length === 0 && haulers.length === 0 && energyAvailable >= 300) {
            var newName = 'Harvester' + Game.time;
            console.log('EMERGENCY SPAWNING harvester: ' + newName);
            spawn.spawnCreep([WORK,WORK,CARRY,MOVE], newName, 
                {memory: {role: 'harvester', number: Memory.spawnQueue.harvesterCount++}});
        }
        // Normal operations
        else if(energyAvailable >= 300) {
            var name = '';
            var body = [];
            var memory = {};
            
            switch(role) {
                case 'harvester':
                    name = 'Harvester' + Game.time;
                    
                    // Design harvester body based on available energy
                    // Prioritize WORK parts for faster harvesting
                    if(energyAvailable >= 800) {
                        body = [WORK,WORK,WORK,WORK,WORK,WORK,CARRY,MOVE]; // 800 energy
                    } else if(energyAvailable >= 650) {
                        body = [WORK,WORK,WORK,WORK,WORK,CARRY,MOVE]; // 650 energy
                    } else if(energyAvailable >= 500) {
                        body = [WORK,WORK,WORK,WORK,CARRY,MOVE]; // 500 energy
                    } else if(energyAvailable >= 350) {
                        body = [WORK,WORK,WORK,CARRY,MOVE]; // 350 energy
                    } else {
                        body = [WORK,WORK,CARRY,MOVE]; // 300 energy
                    }
                    
                    // Assign harvester to a source by index
                    var sourceIndex = Memory.spawnQueue.harvesterCount % sources.length;
                    
                    memory = {
                        role: 'harvester',
                        number: Memory.spawnQueue.harvesterCount++,
                        sourceId: sources[sourceIndex].id
                    };
                    break;
                    
                case 'hauler':
                    name = 'Hauler' + Game.time;
                    
                    // Design hauler body based on available energy
                    // Balance CARRY and MOVE for efficient transport
                    if(energyAvailable >= 600) {
                        body = [CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE]; // 600 energy
                    } else if(energyAvailable >= 400) {
                        body = [CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE]; // 400 energy
                    } else {
                        body = [CARRY,CARRY,MOVE,MOVE]; // 200 energy
                    }
                    
                    memory = {
                        role: 'hauler',
                        number: Memory.spawnQueue.haulerCount++,
                        delivering: false
                    };
                    break;
                    
                case 'upgrader':
                    name = 'Upgrader' + Game.time;
                    
                    // Design upgrader body based on available energy
                    if(energyAvailable >= 700) {
                        body = [WORK,WORK,WORK,WORK,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE]; // 700 energy
                    } else if(energyAvailable >= 500) {
                        body = [WORK,WORK,WORK,CARRY,CARRY,MOVE,MOVE,MOVE]; // 500 energy
                    } else {
                        body = [WORK,WORK,CARRY,MOVE]; // 300 energy
                    }
                    
                    memory = {role: 'upgrader'};
                    break;
                    
                case 'builder':
                    name = 'Builder' + Game.time;
                    
                    // Design builder body based on available energy
                    if(energyAvailable >= 700) {
                        body = [WORK,WORK,WORK,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE]; // 700 energy
                    } else if(energyAvailable >= 500) {
                        body = [WORK,WORK,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE]; // 500 energy
                    } else {
                        body = [WORK,WORK,CARRY,MOVE]; // 300 energy
                    }
                    
                    memory = {role: 'builder'};
                    break;
            }
            
            // Attempt to spawn the creep
            if(body.length > 0) {
                console.log('Spawning new ' + role + ': ' + name);
                var result = spawn.spawnCreep(body, name, {memory: memory});
                
                if(result === OK) {
                    console.log('Successfully spawned ' + name);
                } else {
                    console.log('Failed to spawn ' + name + ' with error: ' + result);
                }
            }
        }
    }

    // Display visual indicator when spawning
    if(spawn.spawning) { 
        var spawningCreep = Game.creeps[spawn.spawning.name];
        spawn.room.visual.text(
            '🛠️' + spawningCreep.memory.role,
            spawn.pos.x + 1, 
            spawn.pos.y, 
            {align: 'left', opacity: 0.8});
    }

    // Run creep logic
    for(var name in Game.creeps) {
        var creep = Game.creeps[name];
        try {
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
        } catch(err) {
            console.log('Error running ' + creep.name + ': ' + err);
        }
    }
    
    // Log CPU usage
    console.log('CPU used: ' + Game.cpu.getUsed().toFixed(2) + '/' + Game.cpu.limit);
};