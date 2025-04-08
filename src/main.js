// Import roles
var roleHarvester = require('harvester');
var roleUpgrader = require('upgrader');
var roleBuilder = require('builder');
var roleHauler = require('hauler');
var roleScout = require('scout');
var roleRemoteHarvester = require('remoteHarvester');
var moveCoordinator = require('moveCoordinator');

module.exports.loop = function () {
    // Initialize the movement coordinator
    moveCoordinator.init();
    
    // Memory cleanup - remove dead creeps
    for(var name in Memory.creeps) {
        if(!Game.creeps[name]) {
            delete Memory.creeps[name];
            console.log('Clearing non-existing creep memory:', name);
        }
    }

    // Clean up old collection targets
    if(Memory.collectionTargets) {
        for(const id in Memory.collectionTargets) {
            if(Game.time - Memory.collectionTargets[id].timestamp > 50) {
                delete Memory.collectionTargets[id];
            }
        }
    }
    
    // Clean up old delivery targets
    if(Memory.deliveryTargets) {
        for(const id in Memory.deliveryTargets) {
            if(!Game.creeps[Memory.deliveryTargets[id]]) {
                delete Memory.deliveryTargets[id];
            }
        }
    }

    // Count creeps by role
    var harvesters = _.filter(Game.creeps, (creep) => creep.memory.role == 'harvester');
    var haulers = _.filter(Game.creeps, (creep) => creep.memory.role == 'hauler');
    var upgraders = _.filter(Game.creeps, (creep) => creep.memory.role == 'upgrader');
    var builders = _.filter(Game.creeps, (creep) => creep.memory.role == 'builder');
    var scouts = _.filter(Game.creeps, (creep) => creep.memory.role == 'scout');
    var remoteHarvesters = _.filter(Game.creeps, (creep) => creep.memory.role == 'remoteHarvester');

    // Log current population
    console.log('Harvesters: ' + harvesters.length + 
                ', Haulers: ' + haulers.length + 
                ', Upgraders: ' + upgraders.length + 
                ', Builders: ' + builders.length +
                ', Scouts: ' + scouts.length +
                ', Remote Harvesters: ' + remoteHarvesters.length);

    // Process each room we own
    for(const roomName in Game.rooms) {
        const room = Game.rooms[roomName];
        
        // Only process rooms we control
        if(room.controller && room.controller.my) {
            processRoom(room);
        }
    }

    // Run creep logic
    for(var name in Game.creeps) {
        var creep = Game.creeps[name];
        
        // Assign a unique number to creep if it doesn't have one
        if(creep.memory.number === undefined) {
            creep.memory.number = Game.time % 1000;
        }
        
        // Run appropriate role logic
        try {
            switch(creep.memory.role) {
                case 'harvester':
                    roleHarvester.run(creep);
                    break;
                case 'hauler':
                    roleHauler.run(creep);
                    break;
                case 'upgrader':
                    roleUpgrader.run(creep);
                    break;
                case 'builder':
                    roleBuilder.run(creep);
                    break;
                case 'scout':
                    roleScout.run(creep);
                    break;
                case 'remoteHarvester':
                    roleRemoteHarvester.run(creep);
                    break;
                default:
                    console.log(`Unknown role for creep ${creep.name}: ${creep.memory.role}`);
            }
        } catch(error) {
            console.log(`Error running creep ${creep.name} with role ${creep.memory.role}: ${error}`);
        }
    }
};

/**
 * Process a room - handle spawning and defense
 */
function processRoom(room) {
    // Get all spawns in this room
    const spawns = room.find(FIND_MY_SPAWNS);
    if(spawns.length === 0) return;
    
    // Use the first spawn for now
    const spawn = spawns[0];
    
    // Skip if we're already spawning
    if(spawn.spawning) {
        displaySpawnInfo(spawn);
        return;
    }
    
    // Check if we need to respond to hostiles
    if(room.find(FIND_HOSTILE_CREEPS).length > 0) {
        handleHostiles(room, spawn);
        return;
    }
    
    // Count creeps by role for this room
    var roomCreeps = _.filter(Game.creeps, (creep) => creep.memory.homeRoom == room.name);
    var harvesters = _.filter(roomCreeps, (creep) => creep.memory.role == 'harvester');
    var haulers = _.filter(roomCreeps, (creep) => creep.memory.role == 'hauler');
    var upgraders = _.filter(roomCreeps, (creep) => creep.memory.role == 'upgrader');
    var builders = _.filter(roomCreeps, (creep) => creep.memory.role == 'builder');
    var scouts = _.filter(roomCreeps, (creep) => creep.memory.role == 'scout');
    var remoteHarvesters = _.filter(roomCreeps, (creep) => creep.memory.role == 'remoteHarvester');
    
    // Count sources in room
    const sources = room.find(FIND_SOURCES);
    const constructionSites = room.find(FIND_CONSTRUCTION_SITES);
    
    // Determine what to spawn next
    var nextRole = determineNextRole(room, {
        harvesters: harvesters.length,
        haulers: haulers.length,
        upgraders: upgraders.length,
        builders: builders.length,
        scouts: scouts.length,
        remoteHarvesters: remoteHarvesters.length,
        sources: sources.length,
        constructionSites: constructionSites.length
    });
    
    console.log(`Room ${room.name} - Next role to spawn: ${nextRole}`);
    
    // Spawn the determined role
    if(nextRole) {
        var energyAvailable = room.energyAvailable;
        spawnCreep(spawn, nextRole, energyAvailable);
    }
}

/**
 * Determine which role to spawn next based on room state
 */
function determineNextRole(room, counts) {
    // Emergency recovery mode - if no harvesters or haulers, focus on them
    if(counts.harvesters === 0) {
        return 'harvester';
    }
    
    if(counts.haulers === 0 && counts.harvesters > 0) {
        return 'hauler';
    }
    
    // Ensure enough harvesters - 1 per source
    if(counts.harvesters < counts.sources) {
        return 'harvester';
    }
    
    // Ensure enough haulers - 1.5 per source rounded up
    const desiredHaulers = Math.ceil(counts.sources * 1.5);
    if(counts.haulers < desiredHaulers) {
        return 'hauler';
    }
    
    // Ensure at least one upgrader
    if(counts.upgraders < 1) {
        return 'upgrader';
    }
    
    // If lots of construction sites, build more builders
    if(counts.constructionSites > 3 && counts.builders < 2) {
        return 'builder';
    } else if(counts.constructionSites > 0 && counts.builders < 1) {
        return 'builder';
    }
    
    // Once basic roles are filled, consider scouts and remote harvesters
    
    // Keep at least one scout
    if(counts.scouts < 1) {
        return 'scout';
    }
    
    // If we have remote harvesting rooms identified, create remote harvesters
    if(Memory.remoteHarvestRooms && Memory.remoteHarvestRooms.length > 0) {
        // Calculate how many remote harvesters we need
        // For each remote room with good potential, we want 1 harvester per source
        let remoteSourceCount = 0;
        for(const roomName of Memory.remoteHarvestRooms) {
            if(Memory.roomData && Memory.roomData[roomName] && 
               Memory.roomData[roomName].sources) {
                remoteSourceCount += Memory.roomData[roomName].sources.length;
            }
        }
        
        if(counts.remoteHarvesters < remoteSourceCount) {
            return 'remoteHarvester';
        }
    }
    
    // RCL-dependent spawning
    if(room.controller.level >= 3) {
        // At higher RCL, focus on upgrading to unlock more building options
        if(counts.upgraders < 2) {
            return 'upgrader';
        }
    }
    
    // Default to spawning more upgraders
    return 'upgrader';
}

/**
 * Spawn a creep based on role and available energy
 */
function spawnCreep(spawn, role, energyAvailable) {
    let body = [];
    let name = '';
    let memory = { 
        role: role,
        homeRoom: spawn.room.name
    };
    
    switch(role) {
        case 'harvester':
            // Design harvester based on available energy
            if(energyAvailable >= 800) {
                body = [WORK,WORK,WORK,WORK,WORK,WORK,CARRY,MOVE,MOVE,MOVE]; // 800 energy
            } else if(energyAvailable >= 550) {
                body = [WORK,WORK,WORK,WORK,CARRY,MOVE,MOVE]; // 550 energy
            } else if(energyAvailable >= 400) {
                body = [WORK,WORK,WORK,CARRY,MOVE]; // 400 energy
            } else if(energyAvailable >= 300) {
                body = [WORK,WORK,CARRY,MOVE]; // 300 energy
            } else if(energyAvailable >= 250) {
                body = [WORK,CARRY,MOVE,MOVE]; // 250 energy
            }
            
            name = 'Harvester' + Game.time;
            break;
            
        case 'hauler':
            // Design hauler based on available energy - more CARRY and MOVE
            if(energyAvailable >= 800) {
                body = [CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE]; // 800 energy
            } else if(energyAvailable >= 500) {
                body = [CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,MOVE]; // 500 energy
            } else if(energyAvailable >= 400) {
                body = [CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE]; // 400 energy
            } else if(energyAvailable >= 300) {
                body = [CARRY,CARRY,CARRY,MOVE,MOVE,MOVE]; // 300 energy
            } else if(energyAvailable >= 200) {
                body = [CARRY,CARRY,MOVE,MOVE]; // 200 energy
            }
            
            name = 'Hauler' + Game.time;
            memory.delivering = false;
            break;
            
        case 'upgrader':
            // Design upgrader based on available energy - balanced WORK, CARRY, MOVE
            if(energyAvailable >= 800) {
                body = [WORK,WORK,WORK,WORK,WORK,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE]; // 800 energy
            } else if(energyAvailable >= 500) {
                body = [WORK,WORK,WORK,CARRY,CARRY,MOVE,MOVE]; // 500 energy
            } else if(energyAvailable >= 350) {
                body = [WORK,WORK,CARRY,CARRY,MOVE]; // 350 energy
            } else if(energyAvailable >= 300) {
                body = [WORK,WORK,CARRY,MOVE]; // 300 energy
            } else if(energyAvailable >= 200) {
                body = [WORK,CARRY,MOVE]; // 200 energy
            }
            
            name = 'Upgrader' + Game.time;
            break;
            
        case 'builder':
            // Design builder based on available energy - similar to upgrader but more CARRY
            if(energyAvailable >= 800) {
                body = [WORK,WORK,WORK,WORK,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE]; // 800 energy
            } else if(energyAvailable >= 500) {
                body = [WORK,WORK,WORK,CARRY,CARRY,MOVE,MOVE]; // 500 energy
            } else if(energyAvailable >= 350) {
                body = [WORK,WORK,CARRY,CARRY,MOVE]; // 350 energy
            } else if(energyAvailable >= 300) {
                body = [WORK,WORK,CARRY,MOVE]; // 300 energy
            } else if(energyAvailable >= 200) {
                body = [WORK,CARRY,MOVE]; // 200 energy
            }
            
            name = 'Builder' + Game.time;
            break;
            
        case 'scout':
            // Scout is just MOVE for fast exploration
            if(energyAvailable >= 300) {
                body = [MOVE,MOVE,MOVE,MOVE,MOVE,MOVE]; // 300 energy
            } else if(energyAvailable >= 200) {
                body = [MOVE,MOVE,MOVE,MOVE]; // 200 energy
            } else if(energyAvailable >= 100) {
                body = [MOVE,MOVE]; // 100 energy
            } else {
                body = [MOVE]; // 50 energy
            }
            
            name = 'Scout' + Game.time;
            break;
            
        case 'remoteHarvester':
            // Remote harvester needs WORK for harvesting, some CARRY, more MOVE for traveling
            if(energyAvailable >= 800) {
                body = [WORK,WORK,WORK,WORK,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE]; // 800 energy
            } else if(energyAvailable >= 600) {
                body = [WORK,WORK,WORK,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,MOVE]; // 600 energy
            } else if(energyAvailable >= 450) {
                body = [WORK,WORK,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE]; // 450 energy
            } else if(energyAvailable >= 300) {
                body = [WORK,WORK,CARRY,MOVE,MOVE]; // 300 energy
            }
            
            name = 'RHarvest' + Game.time;
            break;
    }
    
    // Only spawn if we created a valid body
    if(body.length > 0) {
        console.log(`Attempting to spawn ${role}: ${name} with body: ${body}`);
        const result = spawn.spawnCreep(body, name, { memory: memory });
        console.log(`Spawn result: ${result}`);
    }
}

/**
 * Handle hostile creeps in the room
 */
function handleHostiles(room, spawn) {
    const hostiles = room.find(FIND_HOSTILE_CREEPS);
    
    if(hostiles.length > 0) {
        // Alert about hostiles
        console.log(`ALERT! Room ${room.name} under attack! ${hostiles.length} hostile creeps detected.`);
        
        // Activate towers if available
        const towers = room.find(FIND_MY_STRUCTURES, {
            filter: {structureType: STRUCTURE_TOWER}
        });
        
        for(const tower of towers) {
            const target = tower.pos.findClosestByRange(hostiles);
            if(target) {
                tower.attack(target);
            }
        }
        
        // If we have no towers or not enough, consider spawning defensive creeps
        if(towers.length === 0 || hostiles.length > towers.length) {
            // TODO: Implement defensive creep spawning
        }
    }
}

/**
 * Display spawning information
 */
function displaySpawnInfo(spawn) {
    if(spawn.spawning) { 
        var spawningCreep = Game.creeps[spawn.spawning.name];
        spawn.room.visual.text(
            '🛠️' + spawningCreep.memory.role,
            spawn.pos.x + 1, 
            spawn.pos.y, 
            {align: 'left', opacity: 0.8});
    }
}