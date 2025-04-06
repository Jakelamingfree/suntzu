var roleHauler = {
    /** @param {Creep} creep **/
    run: function(creep) {
        // Debug visualization
        creep.say('🔍');
        console.log(`Hauler ${creep.name} status: ${creep.memory.delivering ? 'delivering' : 'collecting'}`);
        
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
            
            // Debug - report how many targets found
            console.log(`${creep.name} found ${targets.length} spawn/extensions needing energy`);
            
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
                console.log(`${creep.name} found ${targets.length} towers needing energy`);
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
                console.log(`${creep.name} found ${targets.length} storage structures`);
            }
            
            // If no storage, try to find the controller
            if(targets.length == 0 && creep.room.controller) {
                console.log(`${creep.name} found no targets, heading to controller`);
                // If we have nowhere to put energy, follow an upgrader
                var upgraders = _.filter(Game.creeps, (c) => c.memory.role == 'upgrader');
                if(upgraders.length > 0) {
                    console.log(`${creep.name} following upgrader`);
                    creep.moveTo(upgraders[0], {visualizePathStyle: {stroke: '#ffffff'}});
                } else {
                    console.log(`${creep.name} going to controller directly`);
                    // Try going to controller as fallback
                    creep.moveTo(creep.room.controller, {visualizePathStyle: {stroke: '#ffffff'}});
                }
            } else if(targets.length > 0) {
                // If we found a target, move to it and transfer energy
                console.log(`${creep.name} moving to target: ${targets[0].structureType} at ${targets[0].pos}`);
                if(creep.transfer(targets[0], RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(targets[0], {visualizePathStyle: {stroke: '#ffffff'}, reusePath: 5});
                }
            } else {
                console.log(`${creep.name} has nowhere to deliver energy!`);
                creep.say('⚠️ No dest!');
                // Move to center to avoid blocking
                creep.moveTo(new RoomPosition(25, 25, creep.room.name), {visualizePathStyle: {stroke: '#ff0000'}});
            }
        }
        else {
            // ENERGY COLLECTION
            console.log(`${creep.name} looking for energy sources`);
            
            // First priority: Ruins with energy (from the previous player)
            var ruins = creep.room.find(FIND_RUINS, {
                filter: (ruin) => ruin.store[RESOURCE_ENERGY] > 0
            });
            
            console.log(`${creep.name} found ${ruins.length} ruins with energy`);
            
            if(ruins.length > 0) {
                // Sort ruins by amount of energy
                ruins.sort((a, b) => b.store[RESOURCE_ENERGY] - a.store[RESOURCE_ENERGY]);
                
                console.log(`${creep.name} collecting from ruin with ${ruins[0].store[RESOURCE_ENERGY]} energy`);
                if(creep.withdraw(ruins[0], RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(ruins[0], {visualizePathStyle: {stroke: '#ffaa00'}, reusePath: 5});
                }
                return;
            }
            
            // Second priority: Containers near sources
            var containers = creep.room.find(FIND_STRUCTURES, {
                filter: (structure) => {
                    return (
                        structure.structureType == STRUCTURE_CONTAINER &&
                        structure.store[RESOURCE_ENERGY] > creep.store.getFreeCapacity() * 0.5
                    );
                }
            });
            
            console.log(`${creep.name} found ${containers.length} containers with energy`);
            
            // Third priority: Dropped resources
            if(containers.length == 0) {
                var droppedResources = creep.room.find(FIND_DROPPED_RESOURCES, {
                    filter: resource => resource.resourceType == RESOURCE_ENERGY && resource.amount > 50
                });
                
                console.log(`${creep.name} found ${droppedResources.length} dropped resources`);
                
                if(droppedResources.length > 0) {
                    // Sort by amount (largest first)
                    droppedResources.sort((a, b) => b.amount - a.amount);
                    
                    console.log(`${creep.name} collecting ${droppedResources[0].amount} dropped energy`);
                    if(creep.pickup(droppedResources[0]) == ERR_NOT_IN_RANGE) {
                        creep.moveTo(droppedResources[0], {visualizePathStyle: {stroke: '#ffaa00'}, reusePath: 5});
                    }
                    return;
                }
            }
            
            // Look at containers if we found any
            if(containers.length > 0) {
                // Sort containers by energy content (most first)
                containers.sort((a, b) => b.store[RESOURCE_ENERGY] - a.store[RESOURCE_ENERGY]);
                
                console.log(`${creep.name} withdrawing from container with ${containers[0].store[RESOURCE_ENERGY]} energy`);
                if(creep.withdraw(containers[0], RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(containers[0], {visualizePathStyle: {stroke: '#ffaa00'}, reusePath: 5});
                }
            } else {
                // If no containers, look for harvesters to follow
                var harvesters = _.filter(Game.creeps, (c) => c.memory.role == 'harvester');
                if(harvesters.length > 0) {
                    console.log(`${creep.name} following harvester ${harvesters[0].name}`);
                    creep.moveTo(harvesters[0], {visualizePathStyle: {stroke: '#ffaa00'}, reusePath: 5});
                    creep.say('👀 H-ver');
                } else {
                    // Last resort: go to a source
                    console.log(`${creep.name} falling back to direct harvesting`);
                    var sources = creep.room.find(FIND_SOURCES_ACTIVE);
                    if(sources.length > 0) {
                        if(creep.harvest(sources[0]) == ERR_NOT_IN_RANGE) {
                            creep.moveTo(sources[0], {visualizePathStyle: {stroke: '#ffaa00'}, reusePath: 5});
                        }
                    } else {
                        console.log(`${creep.name} found NO energy sources!`);
                        creep.say('⚠️ No src!');
                        // Move to center as a fallback
                        creep.moveTo(new RoomPosition(25, 25, creep.room.name), {visualizePathStyle: {stroke: '#ff0000'}});
                    }
                }
            }
        }
    }
};

module.exports = roleHauler;