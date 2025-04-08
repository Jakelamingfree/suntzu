var roleHauler = {
    /** @param {Creep} creep **/
    run: function(creep) {
        // Reduce debug logging to improve performance
        if(Game.time % 10 === 0) {
            // Debug visualization
            creep.say('🔍');
            console.log(`Hauler ${creep.name} status: ${creep.memory.delivering ? 'delivering' : 'collecting'}`);
        }
        
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
            this.runDelivery(creep);
        } else {
            this.runCollection(creep);
        }
    },
    
    runDelivery: function(creep) {
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
        
        // Debug - report targets once per 10 ticks
        if(Game.time % 10 === 0) {
            console.log(`${creep.name} found ${targets.length} spawn/extensions needing energy`);
        }
        
        // Sort targets by distance to reduce travel time
        if(targets.length > 1) {
            targets.sort((a, b) => {
                return creep.pos.getRangeTo(a) - creep.pos.getRangeTo(b);
            });
        }
        
        // If no spawns/extensions need energy, check for towers
        if(targets.length == 0) {
            targets = creep.room.find(FIND_STRUCTURES, {
                filter: (structure) => {
                    return (
                        structure.structureType == STRUCTURE_TOWER &&
                        structure.store.getFreeCapacity(RESOURCE_ENERGY) > 200
                    );
                }
            });
            if(Game.time % 10 === 0) {
                console.log(`${creep.name} found ${targets.length} towers needing energy`);
            }
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
            if(Game.time % 10 === 0) {
                console.log(`${creep.name} found ${targets.length} storage structures`);
            }
        }
        
        // If no storage, try to find the controller or follow an upgrader
        if(targets.length == 0 && creep.room.controller) {
            // If we have nowhere to put energy, follow an upgrader
            var upgraders = _.filter(Game.creeps, (c) => c.memory.role == 'upgrader');
            if(upgraders.length > 0) {
                if(Game.time % 10 === 0) {
                    console.log(`${creep.name} following upgrader`);
                }
                creep.moveTo(upgraders[0], {visualizePathStyle: {stroke: '#ffffff'}});
            } else {
                if(Game.time % 10 === 0) {
                    console.log(`${creep.name} going to controller directly`);
                }
                // Try going to controller as fallback
                creep.moveTo(creep.room.controller, {visualizePathStyle: {stroke: '#ffffff'}});
            }
        } else if(targets.length > 0) {
            // If we found a target, move to it and transfer energy
            if(creep.transfer(targets[0], RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                creep.moveTo(targets[0], {
                    visualizePathStyle: {stroke: '#ffffff'}, 
                    reusePath: 5,
                    plainCost: 2,
                    swampCost: 10 // Avoid swamps for faster delivery
                });
            }
        } else {
            // Move to center to avoid blocking
            creep.say('⚠️ No dest!');
            creep.moveTo(new RoomPosition(25, 25, creep.room.name), {visualizePathStyle: {stroke: '#ff0000'}});
        }
    },
    
    runCollection: function(creep) {
        if(Game.time % 10 === 0) {
            console.log(`${creep.name} looking for energy sources`);
        }
        
        // ENERGY COLLECTION PRIORITY:
        // 1. Dropped resources with large amounts
        // 2. Containers near sources with significant energy
        // 3. Ruins with energy
        // 4. Smaller dropped resources
        // 5. Follow harvesters
        
        // First check for significant dropped resources (more efficient to pick these up first)
        var droppedResources = creep.room.find(FIND_DROPPED_RESOURCES, {
            filter: resource => resource.resourceType == RESOURCE_ENERGY && resource.amount > 100
        });
        
        if(droppedResources.length > 0) {
            // Sort by amount (largest first)
            droppedResources.sort((a, b) => b.amount - a.amount);
            
            // Pick up the largest pile
            if(creep.pickup(droppedResources[0]) == ERR_NOT_IN_RANGE) {
                creep.moveTo(droppedResources[0], {
                    visualizePathStyle: {stroke: '#ffaa00'}, 
                    reusePath: 5
                });
            }
            return;
        }
        
        // Find containers near sources with significant energy
        var containers = creep.room.find(FIND_STRUCTURES, {
            filter: (structure) => {
                return (
                    structure.structureType == STRUCTURE_CONTAINER &&
                    structure.store[RESOURCE_ENERGY] > creep.store.getFreeCapacity() * 0.5
                );
            }
        });
        
        if(containers.length > 0) {
            // Sort containers by energy content (most first)
            containers.sort((a, b) => b.store[RESOURCE_ENERGY] - a.store[RESOURCE_ENERGY]);
            
            if(creep.withdraw(containers[0], RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                creep.moveTo(containers[0], {
                    visualizePathStyle: {stroke: '#ffaa00'}, 
                    reusePath: 5
                });
            }
            return;
        }
        
        // Check for ruins with energy
        var ruins = creep.room.find(FIND_RUINS, {
            filter: (ruin) => ruin.store[RESOURCE_ENERGY] > 0
        });
        
        if(ruins.length > 0) {
            // Sort ruins by amount of energy
            ruins.sort((a, b) => b.store[RESOURCE_ENERGY] - a.store[RESOURCE_ENERGY]);
            
            if(creep.withdraw(ruins[0], RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                creep.moveTo(ruins[0], {
                    visualizePathStyle: {stroke: '#ffaa00'}, 
                    reusePath: 5
                });
            }
            return;
        }
        
        // Check for smaller dropped resources
        var smallDropped = creep.room.find(FIND_DROPPED_RESOURCES, {
            filter: resource => resource.resourceType == RESOURCE_ENERGY && resource.amount > 20
        });
        
        if(smallDropped.length > 0) {
            // Sort by amount and distance
            smallDropped.sort((a, b) => {
                // Give more weight to amount than distance
                const aScore = a.amount - (creep.pos.getRangeTo(a) * 10);
                const bScore = b.amount - (creep.pos.getRangeTo(b) * 10);
                return bScore - aScore;
            });
            
            if(creep.pickup(smallDropped[0]) == ERR_NOT_IN_RANGE) {
                creep.moveTo(smallDropped[0], {
                    visualizePathStyle: {stroke: '#ffaa00'}, 
                    reusePath: 5
                });
            }
            return;
        }
        
        // If all else fails, follow harvesters to collect their dropped energy
        var harvesters = _.filter(Game.creeps, (c) => c.memory.role == 'harvester');
        if(harvesters.length > 0) {
            // Assign to a specific harvester if not already assigned
            if(!creep.memory.targetHarvester || !Game.creeps[creep.memory.targetHarvester]) {
                // Distribute haulers evenly among harvesters
                creep.memory.targetHarvester = harvesters[creep.memory.number % harvesters.length].name;
            }
            
            const harvester = Game.creeps[creep.memory.targetHarvester];
            if(harvester) {
                creep.say('👀 H-ver');
                creep.moveTo(harvester, {
                    visualizePathStyle: {stroke: '#ffaa00'}, 
                    reusePath: 5
                });
            } else {
                // Target harvester no longer exists, reset
                delete creep.memory.targetHarvester;
            }
        } else {
            // Last resort: try direct harvesting
            var sources = creep.room.find(FIND_SOURCES_ACTIVE);
            if(sources.length > 0) {
                if(creep.harvest(sources[0]) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(sources[0], {
                        visualizePathStyle: {stroke: '#ffaa00'}, 
                        reusePath: 5
                    });
                }
            } else {
                creep.say('⚠️ No src!');
                // Move to center to avoid blocking
                creep.moveTo(new RoomPosition(25, 25, creep.room.name), {visualizePathStyle: {stroke: '#ff0000'}});
            }
        }
    }
};

module.exports = roleHauler;