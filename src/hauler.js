var roleHauler = {
    /** @param {Creep} creep **/
    run: function(creep) {
        // State transition logic
        if(creep.memory.delivering && creep.store[RESOURCE_ENERGY] == 0) {
            creep.memory.delivering = false;
            creep.say('🔄 collect');
        }
        if(!creep.memory.delivering && creep.store.getFreeCapacity() == 0) {
            creep.memory.delivering = true;
            creep.say('📦 deliver');
        }

        if(creep.memory.delivering) {
            // Priority order for delivery:
            // 1. Spawn and extensions
            // 2. Towers
            // 3. Storage
            
            // Find energy-needing structures
            var targets = creep.room.find(FIND_STRUCTURES, {
                filter: (structure) => {
                    return (
                        (structure.structureType == STRUCTURE_EXTENSION ||
                         structure.structureType == STRUCTURE_SPAWN) &&
                        structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
                    );
                }
            });
            
            // If no spawns/extensions need energy, check for towers
            if(targets.length == 0) {
                targets = creep.room.find(FIND_STRUCTURES, {
                    filter: (structure) => {
                        return (
                            structure.structureType == STRUCTURE_TOWER &&
                            structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
                        );
                    }
                });
            }
            
            // If no towers need energy, put it in storage
            if(targets.length == 0) {
                targets = creep.room.find(FIND_STRUCTURES, {
                    filter: (structure) => {
                        return (
                            structure.structureType == STRUCTURE_STORAGE &&
                            structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
                        );
                    }
                });
            }
            
            // If we found a target, move to it and transfer energy
            if(targets.length > 0) {
                if(creep.transfer(targets[0], RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(targets[0], {visualizePathStyle: {stroke: '#ffffff'}});
                }
            } else {
                // If we have nowhere to put energy, follow an upgrader or builder
                var upgraders = _.filter(Game.creeps, (c) => c.memory.role == 'upgrader');
                if(upgraders.length > 0) {
                    creep.moveTo(upgraders[0], {visualizePathStyle: {stroke: '#ffffff'}});
                } else {
                    var builders = _.filter(Game.creeps, (c) => c.memory.role == 'builder');
                    if(builders.length > 0) {
                        creep.moveTo(builders[0], {visualizePathStyle: {stroke: '#ffffff'}});
                    }
                }
            }
        }
        else {
            // Not delivering, so collect energy
            // First priority: Containers near sources
            var containers = creep.room.find(FIND_STRUCTURES, {
                filter: (structure) => {
                    return (
                        structure.structureType == STRUCTURE_CONTAINER &&
                        structure.store[RESOURCE_ENERGY] > creep.store.getFreeCapacity() * 0.5
                    );
                }
            });
            
            // Second priority: Dropped resources
            if(containers.length == 0) {
                var droppedResources = creep.room.find(FIND_DROPPED_RESOURCES, {
                    filter: resource => resource.resourceType == RESOURCE_ENERGY && resource.amount > 50
                });
                
                if(droppedResources.length > 0) {
                    // Sort by amount (largest first)
                    droppedResources.sort((a, b) => b.amount - a.amount);
                    
                    if(creep.pickup(droppedResources[0]) == ERR_NOT_IN_RANGE) {
                        creep.moveTo(droppedResources[0], {visualizePathStyle: {stroke: '#ffaa00'}});
                    }
                    return;
                }
            }
            
            // Pick the container with the most energy
            if(containers.length > 0) {
                // Sort containers by energy content (most first)
                containers.sort((a, b) => b.store[RESOURCE_ENERGY] - a.store[RESOURCE_ENERGY]);
                
                if(creep.withdraw(containers[0], RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(containers[0], {visualizePathStyle: {stroke: '#ffaa00'}});
                }
            } else {
                // If no containers are available, fall back to harvesting directly
                var sources = creep.room.find(FIND_SOURCES_ACTIVE);
                if(creep.harvest(sources[0]) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(sources[0], {visualizePathStyle: {stroke: '#ffaa00'}});
                }
            }
        }
    }
};

module.exports = roleHauler;