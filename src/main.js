// Simplified main.js - Focuses on reliability and basic colony functionality

module.exports.loop = function() {
    try {
        // Track execution with a heartbeat
        if (!Memory.stats) Memory.stats = {};
        Memory.stats.lastTick = Game.time;
        
        // Clean up memory of dead creeps
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
        
        // Log current population every 10 ticks to save CPU
        if (Game.time % 10 === 0) {
            console.log('Harvesters: ' + harvesters.length + 
                        ', Haulers: ' + haulers.length + 
                        ', Upgraders: ' + upgraders.length + 
                        ', Builders: ' + builders.length);
        }
        
        // Process each room we own
        for(const roomName in Game.rooms) {
            const room = Game.rooms[roomName];
            
            // Only process rooms we control
            if(room.controller && room.controller.my) {
                processRoom(room, {
                    harvesters: harvesters.filter(c => c.memory.homeRoom === roomName).length,
                    haulers: haulers.filter(c => c.memory.homeRoom === roomName).length,
                    upgraders: upgraders.filter(c => c.memory.homeRoom === roomName).length,
                    builders: builders.filter(c => c.memory.homeRoom === roomName).length
                });
            }
        }
        
        // Run creep logic
        for(var name in Game.creeps) {
            var creep = Game.creeps[name];
            
            try {
                switch(creep.memory.role) {
                    case 'harvester':
                        runHarvester(creep);
                        break;
                    case 'hauler':
                        runHauler(creep);
                        break;
                    case 'upgrader':
                        runUpgrader(creep);
                        break;
                    case 'builder':
                        runBuilder(creep);
                        break;
                    default:
                        console.log(`Unknown role for creep ${creep.name}: ${creep.memory.role}`);
                }
            } catch(creepError) {
                console.log(`Error running creep ${creep.name}: ${creepError.stack || creepError}`);
            }
        }
        
        // Track CPU usage
        Memory.stats.cpu = {
            used: Game.cpu.getUsed(),
            limit: Game.cpu.limit,
            bucket: Game.cpu.bucket
        };
        
    } catch(error) {
        // Global error handling
        console.log(`CRITICAL ERROR in main loop: ${error.stack || error}`);
    }
};

/**
 * Process a room - handle spawning and defense
 */
function processRoom(room, counts) {
    // Get all spawns in this room
    const spawns = room.find(FIND_MY_SPAWNS);
    if(spawns.length === 0) return;
    
    // Use the first spawn
    const spawn = spawns[0];
    
    // Skip if already spawning
    if(spawn.spawning) {
        displaySpawnInfo(spawn);
        return;
    }
    
    // Check for hostiles
    const hostiles = room.find(FIND_HOSTILE_CREEPS);
    if(hostiles.length > 0) {
        handleHostiles(room);
    }
    
    // Count sources
    const sources = room.find(FIND_SOURCES);
    const constructionSites = room.find(FIND_CONSTRUCTION_SITES);
    
    // Determine what to spawn next
    let nextRole = null;
    
    // Emergency recovery - always maintain at least one harvester
    if(counts.harvesters === 0) {
        nextRole = 'harvester';
    }
    // Then ensure we have haulers to move energy
    else if(counts.haulers === 0 && counts.harvesters > 0) {
        nextRole = 'hauler';
    }
    // Ensure at least one harvester per source
    else if(counts.harvesters < sources.length) {
        nextRole = 'harvester';
    }
    // Ensure at least 1 hauler per source
    else if(counts.haulers < sources.length) {
        nextRole = 'hauler';
    }
    // Ensure at least one upgrader
    else if(counts.upgraders < 1) {
        nextRole = 'upgrader';
    }
    // If we have construction sites, build a builder
    else if(constructionSites.length > 0 && counts.builders < 1) {
        nextRole = 'builder';
    }
    // As we grow, add more upgraders
    else if(counts.upgraders < 2 && room.controller.level < 8) {
        nextRole = 'upgrader';
    }
    // Add more haulers as needed
    else if(counts.haulers < Math.ceil(sources.length * 1.5)) {
        nextRole = 'hauler';
    }
    // Default to more upgraders
    else if(room.controller.level < 8) {
        nextRole = 'upgrader';
    }
    // Or builders if we have construction
    else if(constructionSites.length > 0) {
        nextRole = 'builder';
    }
    
    // Spawn the creep if we decided on a role
    if(nextRole) {
        spawnCreep(spawn, nextRole, room.energyAvailable);
    }
}

/**
 * Spawn a creep based on role and available energy
 */
function spawnCreep(spawn, role, energy) {
    let body = [];
    let name = role.charAt(0).toUpperCase() + role.slice(1) + Game.time;
    let memory = { 
        role: role,
        homeRoom: spawn.room.name
    };
    
    // Add role-specific memory
    if(role === 'hauler') {
        memory.delivering = false;
    }
    
    // Design body based on available energy
    switch(role) {
        case 'harvester':
            if(energy >= 550) {
                body = [WORK,WORK,WORK,WORK,CARRY,MOVE,MOVE]; // 550 energy
            } else if(energy >= 400) {
                body = [WORK,WORK,WORK,CARRY,MOVE]; // 400 energy
            } else if(energy >= 250) {
                body = [WORK,WORK,CARRY,MOVE]; // 300 energy
            } else {
                body = [WORK,CARRY,MOVE]; // 200 energy
            }
            break;
            
        case 'hauler':
            if(energy >= 400) {
                body = [CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE]; // 400 energy
            } else if(energy >= 300) {
                body = [CARRY,CARRY,CARRY,MOVE,MOVE,MOVE]; // 300 energy
            } else if(energy >= 200) {
                body = [CARRY,CARRY,MOVE,MOVE]; // 200 energy
            } else {
                body = [CARRY,MOVE]; // 100 energy
            }
            break;
            
        case 'upgrader':
        case 'builder':
            if(energy >= 400) {
                body = [WORK,WORK,CARRY,CARRY,MOVE,MOVE]; // 400 energy
            } else if(energy >= 300) {
                body = [WORK,WORK,CARRY,MOVE]; // 300 energy
            } else {
                body = [WORK,CARRY,MOVE]; // 200 energy
            }
            break;
    }
    
    // Only spawn if we created a valid body
    if(body.length > 0) {
        const result = spawn.spawnCreep(body, name, { memory: memory });
        
        if(result === OK) {
            console.log(`Spawning ${role}: ${name}`);
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

/**
 * Handle hostile creeps in the room
 */
function handleHostiles(room) {
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
    }
}

/**
 * Run harvester logic
 */
function runHarvester(creep) {
    // Assign a source if needed
    if(!creep.memory.sourceId) {
        const sources = creep.room.find(FIND_SOURCES);
        if(sources.length > 0) {
            // Distribute harvesters among sources
            const sourceIndex = (Game.time + creep.id.charCodeAt(0)) % sources.length;
            creep.memory.sourceId = sources[sourceIndex].id;
        }
    }
    
    const source = Game.getObjectById(creep.memory.sourceId);
    if(!source) return;
    
    // Harvest from source
    if(creep.harvest(source) === ERR_NOT_IN_RANGE) {
        creep.moveTo(source, {visualizePathStyle: {stroke: '#ffaa00'}});
        creep.say('🔄 harvest');
    } else {
        creep.say('⛏️ mining');
    }
    
    // If full, try to find a container or drop energy
    if(creep.store.getFreeCapacity() === 0) {
        const container = source.pos.findInRange(FIND_STRUCTURES, 1, {
            filter: s => s.structureType === STRUCTURE_CONTAINER
        })[0];
        
        if(container) {
            creep.transfer(container, RESOURCE_ENERGY);
        } else {
            creep.drop(RESOURCE_ENERGY);
            creep.say('💧 drop');
        }
    }
}

/**
 * Run hauler logic
 */
function runHauler(creep) {
    // Switch states if needed
    if(creep.memory.delivering && creep.store[RESOURCE_ENERGY] === 0) {
        creep.memory.delivering = false;
        creep.say('🔄 collect');
    }
    if(!creep.memory.delivering && creep.store.getFreeCapacity() === 0) {
        creep.memory.delivering = true;
        creep.say('📦 deliver');
    }
    
    if(creep.memory.delivering) {
        // Find structures that need energy
        let target = creep.pos.findClosestByPath(FIND_STRUCTURES, {
            filter: (structure) => {
                return (structure.structureType === STRUCTURE_EXTENSION ||
                        structure.structureType === STRUCTURE_SPAWN) &&
                        structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
            }
        });
        
        // If no spawns/extensions need energy, try towers
        if(!target) {
            target = creep.pos.findClosestByPath(FIND_STRUCTURES, {
                filter: (structure) => {
                    return structure.structureType === STRUCTURE_TOWER &&
                           structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
                }
            });
        }
        
        // If no towers, try storage
        if(!target) {
            target = creep.pos.findClosestByPath(FIND_STRUCTURES, {
                filter: (structure) => {
                    return structure.structureType === STRUCTURE_STORAGE &&
                           structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
                }
            });
        }
        
        // If we found a target, move to it and transfer energy
        if(target) {
            if(creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.moveTo(target, {visualizePathStyle: {stroke: '#ffffff'}});
            }
        } else {
            // If no target, move near controller
            creep.moveTo(creep.room.controller, {visualizePathStyle: {stroke: '#ffffff'}, range: 3});
        }
    } else {
        // Collect energy - first look for dropped resources
        const droppedResource = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {
            filter: resource => resource.resourceType === RESOURCE_ENERGY && resource.amount > 20
        });
        
        if(droppedResource) {
            if(creep.pickup(droppedResource) === ERR_NOT_IN_RANGE) {
                creep.moveTo(droppedResource, {visualizePathStyle: {stroke: '#ffaa00'}});
            }
            return;
        }
        
        // Then check containers
        const container = creep.pos.findClosestByPath(FIND_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_CONTAINER && 
                      s.store[RESOURCE_ENERGY] > 0
        });
        
        if(container) {
            if(creep.withdraw(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.moveTo(container, {visualizePathStyle: {stroke: '#ffaa00'}});
            }
            return;
        }
        
        // Find harvesters to follow
        const harvester = creep.pos.findClosestByPath(FIND_MY_CREEPS, {
            filter: c => c.memory.role === 'harvester' && 
                      c.store[RESOURCE_ENERGY] > 0
        });
        
        if(harvester) {
            creep.moveTo(harvester, {visualizePathStyle: {stroke: '#ffaa00'}, range: 1});
            creep.say('👀 H-ver');
            return;
        }
        
        // Last resort: go to a source
        const source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
        if(source) {
            creep.moveTo(source, {visualizePathStyle: {stroke: '#ffaa00'}, range: 2});
        }
    }
}

/**
 * Run upgrader logic
 */
function runUpgrader(creep) {
    // Switch states if needed
    if(creep.memory.upgrading && creep.store[RESOURCE_ENERGY] === 0) {
        creep.memory.upgrading = false;
        creep.say('🔄 collect');
    }
    if(!creep.memory.upgrading && creep.store.getFreeCapacity() === 0) {
        creep.memory.upgrading = true;
        creep.say('⚡ upgrade');
    }
    
    if(creep.memory.upgrading) {
        // Upgrade controller
        if(creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
            creep.moveTo(creep.room.controller, {visualizePathStyle: {stroke: '#ffffff'}});
        }
    } else {
        // Collect energy - first check containers
        const container = creep.pos.findClosestByPath(FIND_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_CONTAINER && 
                      s.store[RESOURCE_ENERGY] > 50
        });
        
        if(container) {
            if(creep.withdraw(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.moveTo(container, {visualizePathStyle: {stroke: '#ffaa00'}});
            }
            return;
        }
        
        // Then try dropped resources
        const droppedResource = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {
            filter: resource => resource.resourceType === RESOURCE_ENERGY && resource.amount > 20
        });
        
        if(droppedResource) {
            if(creep.pickup(droppedResource) === ERR_NOT_IN_RANGE) {
                creep.moveTo(droppedResource, {visualizePathStyle: {stroke: '#ffaa00'}});
            }
            return;
        }
        
        // Fall back to harvesting directly
        const source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
        if(source) {
            if(creep.harvest(source) === ERR_NOT_IN_RANGE) {
                creep.moveTo(source, {visualizePathStyle: {stroke: '#ffaa00'}});
            }
        }
    }
}

/**
 * Run builder logic
 */
function runBuilder(creep) {
    // Switch states if needed
    if(creep.memory.building && creep.store[RESOURCE_ENERGY] === 0) {
        creep.memory.building = false;
        creep.say('🔄 collect');
    }
    if(!creep.memory.building && creep.store.getFreeCapacity() === 0) {
        creep.memory.building = true;
        creep.say('🚧 build');
    }
    
    if(creep.memory.building) {
        // Find construction sites
        const site = creep.pos.findClosestByPath(FIND_CONSTRUCTION_SITES);
        
        if(site) {
            if(creep.build(site) === ERR_NOT_IN_RANGE) {
                creep.moveTo(site, {visualizePathStyle: {stroke: '#ffffff'}});
            }
        } else {
            // If no construction sites, help with upgrading
            if(creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
                creep.moveTo(creep.room.controller, {visualizePathStyle: {stroke: '#ffffff'}});
            }
        }
    } else {
        // Collect energy - first check containers
        const container = creep.pos.findClosestByPath(FIND_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_CONTAINER && 
                      s.store[RESOURCE_ENERGY] > 50
        });
        
        if(container) {
            if(creep.withdraw(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.moveTo(container, {visualizePathStyle: {stroke: '#ffaa00'}});
            }
            return;
        }
        
        // Then try dropped resources
        const droppedResource = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {
            filter: resource => resource.resourceType === RESOURCE_ENERGY && resource.amount > 20
        });
        
        if(droppedResource) {
            if(creep.pickup(droppedResource) === ERR_NOT_IN_RANGE) {
                creep.moveTo(droppedResource, {visualizePathStyle: {stroke: '#ffaa00'}});
            }
            return;
        }
        
        // Fall back to harvesting directly
        const source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
        if(source) {
            if(creep.harvest(source) === ERR_NOT_IN_RANGE) {
                creep.moveTo(source, {visualizePathStyle: {stroke: '#ffaa00'}});
            }
        }
    }
}