var moveCoordinator = require('moveCoordinator');

/**
 * Enhanced Hauler Role
 * - Improved resource collection priority
 * - Multi-room energy collection support
 * - Load balancing between sources
 * - Work queue system to prevent duplicate targeting
 */
var roleHauler = {
    /** @param {Creep} creep **/
    run: function(creep) {
        // Initialize memory on first run
        if(!creep.memory.homeRoom) {
            creep.memory.homeRoom = creep.room.name;
        }
        
        // State transition logic
        if(creep.memory.delivering && creep.store[RESOURCE_ENERGY] == 0) {
            creep.memory.delivering = false;
            creep.say('🔄 collect');
            // Reset the target when transitioning states
            delete creep.memory.targetId;
        }
        if(!creep.memory.delivering && creep.store.getFreeCapacity() == 0) {
            creep.memory.delivering = true;
            creep.say('📦 deliver');
            // Reset the target when transitioning states
            delete creep.memory.targetId;
        }
        
        // Check if in homeRoom
        if(creep.room.name !== creep.memory.homeRoom) {
            // We're in a remote room
            
            // If we're delivering, head back to home room
            if(creep.memory.delivering) {
                this.returnToHomeRoom(creep);
                return;
            }
            // Otherwise continue collecting in the remote room
        }

        // Normal operation based on state
        if(creep.memory.delivering) {
            this.runDelivery(creep);
        } else {
            this.runCollection(creep);
        }
    },
    
    /**
     * Return to home room
     */
    returnToHomeRoom: function(creep) {
        // Find exit to home room
        const exitDir = Game.map.findExit(creep.room, creep.memory.homeRoom);
        if(exitDir === ERR_NO_PATH) {
            // No path to home room - might be blocked
            creep.say('⚠️ No path');
            
            // Move to center of current room to try again
            creep.moveTo(new RoomPosition(25, 25, creep.room.name));
            return;
        }
        
        const exit = creep.pos.findClosestByPath(exitDir);
        if(exit) {
            moveCoordinator.moveTo(creep, exit, {
                visualizePathStyle: {stroke: '#ffaa00'},
                reusePath: 50 // Long reuse for room-to-room travel
            });
        }
    },
    
    /**
     * Travel to a remote room for harvesting
     */
    travelToRemoteRoom: function(creep, roomName) {
        const exitDir = Game.map.findExit(creep.room, roomName);
        if(exitDir === ERR_NO_PATH) {
            // No path to target room
            creep.say('⚠️ No path');
            return false;
        }
        
        const exit = creep.pos.findClosestByPath(exitDir);
        if(exit) {
            moveCoordinator.moveTo(creep, exit, {
                visualizePathStyle: {stroke: '#ffaa00'},
                reusePath: 50
            });
            return true;
        }
        
        return false;
    },
    
    runDelivery: function(creep) {
        // If we have a specific target, use it
        if(creep.memory.targetId) {
            const target = Game.getObjectById(creep.memory.targetId);
            if(target && target.store && target.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
                if(creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    moveCoordinator.moveTo(creep, target, {
                        visualizePathStyle: {stroke: '#ffffff'},
                        reusePath: 10
                    });
                }
                return;
            } else {
                // Target is invalid or full, clear it
                delete creep.memory.targetId;
            }
        }
        
        // Find all structures that need energy
        const structures = this.findEnergyNeedingStructures(creep.room);
        
        // Register this delivery in the global delivery queue
        this.registerDeliveryTarget(creep, structures);
        
        // Get the assigned target
        const target = Game.getObjectById(creep.memory.targetId);
        
        if(target) {
            if(creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                moveCoordinator.moveTo(creep, target, {
                    visualizePathStyle: {stroke: '#ffffff'},
                    reusePath: 10
                });
            }
        } else {
            // No target found, go to controller or backup upgrader
            this.handleNoDeliveryTarget(creep);
        }
    },
    
    /**
     * Find all structures in the room that need energy
     */
    findEnergyNeedingStructures: function(room) {
        const priorities = [];
        
        // Priority 1: Spawns and extensions
        const spawnsAndExtensions = room.find(FIND_STRUCTURES, {
            filter: structure => {
                return (structure.structureType === STRUCTURE_SPAWN || 
                        structure.structureType === STRUCTURE_EXTENSION) &&
                       structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
            }
        });
        
        if(spawnsAndExtensions.length > 0) {
            priorities.push({
                priority: 1,
                structures: spawnsAndExtensions
            });
        }
        
        // Priority 2: Towers with less than 80% energy
        const towers = room.find(FIND_STRUCTURES, {
            filter: structure => {
                return structure.structureType === STRUCTURE_TOWER &&
                       structure.store.getFreeCapacity(RESOURCE_ENERGY) > structure.store.getCapacity(RESOURCE_ENERGY) * 0.2;
            }
        });
        
        if(towers.length > 0) {
            priorities.push({
                priority: 2,
                structures: towers
            });
        }
        
        // Priority 3: Storage structures 
        const storages = room.find(FIND_STRUCTURES, {
            filter: structure => {
                return (structure.structureType === STRUCTURE_STORAGE) &&
                       structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
            }
        });
        
        if(storages.length > 0) {
            priorities.push({
                priority: 3,
                structures: storages
            });
        }
        
        return priorities;
    },
    
    /**
     * Register this hauler for a delivery target
     */
    registerDeliveryTarget: function(creep, priorities) {
        if(!Memory.deliveryTargets) {
            Memory.deliveryTargets = {};
        }
        
        // Already have a target
        if(creep.memory.targetId) return;
        
        // Look through all priorities
        for(const priority of priorities) {
            // Try to find a target that isn't already assigned or is closest
            const availableTargets = priority.structures.filter(s => {
                // If target is not in memory yet, it's available
                if(!Memory.deliveryTargets[s.id]) return true;
                
                // If the assigned hauler no longer exists, the target is available
                const assignedHauler = Game.creeps[Memory.deliveryTargets[s.id]];
                if(!assignedHauler) {
                    delete Memory.deliveryTargets[s.id];
                    return true;
                }
                
                // If the assigned hauler is not delivering anymore, it's available
                if(!assignedHauler.memory.delivering) {
                    delete Memory.deliveryTargets[s.id];
                    return true;
                }
                
                return false;
            });
            
            if(availableTargets.length > 0) {
                // Sort by distance
                availableTargets.sort((a, b) => {
                    return creep.pos.getRangeTo(a) - creep.pos.getRangeTo(b);
                });
                
                // Assign the closest target
                creep.memory.targetId = availableTargets[0].id;
                Memory.deliveryTargets[availableTargets[0].id] = creep.name;
                return;
            }
        }
    },
    
    /**
     * Handle case where no delivery target is found
     */
    handleNoDeliveryTarget: function(creep) {
        // Attempt to help upgraders or go to controller
        var upgraders = _.filter(Game.creeps, c => 
            c.memory.role === 'upgrader' && 
            c.room.name === creep.room.name
        );
        
        if(upgraders.length > 0) {
            // Find closest upgrader
            const closest = creep.pos.findClosestByPath(upgraders);
            if(closest) {
                moveCoordinator.moveTo(creep, closest, {
                    visualizePathStyle: {stroke: '#ffffff'},
                    range: 3 // Stay near upgrader but not too close
                });
                return;
            }
        }
        
        // Go to controller as fallback
        if(creep.room.controller) {
            moveCoordinator.moveTo(creep, creep.room.controller, {
                visualizePathStyle: {stroke: '#ffffff'},
                range: 3 // Stay near controller but not too close
            });
        } else {
            // Move to center to avoid blocking
            creep.say('⚠️ No dest!');
            moveCoordinator.moveTo(creep, new RoomPosition(25, 25, creep.room.name), {
                visualizePathStyle: {stroke: '#ff0000'}
            });
        }
    },
    
    runCollection: function(creep) {
        // Log status less frequently to save CPU
        if(Game.time % 20 === 0) {
            console.log(`Hauler ${creep.name} collecting in ${creep.room.name}`);
        }
        
        // Check if we should seek energy in another room
        if(this.shouldSeekRemoteEnergy(creep)) {
            // Find a remote harvesting room
            const remoteRoom = this.findRemoteHarvestingRoom(creep);
            if(remoteRoom) {
                creep.say('🌎 Remote');
                this.travelToRemoteRoom(creep, remoteRoom);
                return;
            }
        }
        
        // If we have a specific target, use it
        if(creep.memory.targetId) {
            const target = Game.getObjectById(creep.memory.targetId);
            if(this.collectFromTarget(creep, target)) {
                return;
            } else {
                // Target is invalid or empty, clear it
                delete creep.memory.targetId;
            }
        }
        
        // ENERGY COLLECTION PRIORITY:
        // 1. Dropped resources with large amounts
        // 2. Containers near sources with significant energy
        // 3. Ruins with energy
        // 4. Smaller dropped resources
        // 5. Follow harvesters
        
        // If no target assigned, find a new one
        const target = this.findCollectionTarget(creep);
        
        if(target) {
            // Store target id for future ticks
            creep.memory.targetId = target.id;
            
            // Collect from target
            this.collectFromTarget(creep, target);
        } else {
            // No targets found, follow harvesters
            this.followHarvester(creep);
        }
    },
    
    /**
     * Determine if this hauler should seek energy in a remote room
     */
    shouldSeekRemoteEnergy: function(creep) {
        // Only seek remote energy if:
        // 1. Current room's sources are congested (many harvesters)
        // 2. We've identified remote harvesting rooms
        // 3. The hauler is nearly empty
        
        if(creep.store[RESOURCE_ENERGY] > creep.store.getCapacity() * 0.3) {
            return false; // Not empty enough to justify the trip
        }
        
        // Check if current room sources are congested
        const harvesters = _.filter(Game.creeps, c => 
            c.memory.role === 'harvester' && 
            c.room.name === creep.room.name
        );
        
        const sources = creep.room.find(FIND_SOURCES);
        
        // If more than 1 harvester per source, consider congested
        if(harvesters.length > sources.length) {
            // Check if we have remote rooms identified
            if(Memory.remoteHarvestRooms && Memory.remoteHarvestRooms.length > 0) {
                return true;
            }
        }
        
        return false;
    },
    
    /**
     * Find a suitable remote harvesting room
     */
    findRemoteHarvestingRoom: function(creep) {
        if(!Memory.remoteHarvestRooms || Memory.remoteHarvestRooms.length === 0) {
            return null;
        }
        
        // Pick a remote room - could implement more sophisticated logic here
        return Memory.remoteHarvestRooms[0];
    },
    
    /**
     * Find a suitable collection target
     */
    findCollectionTarget: function(creep) {
        // First check for significant dropped resources (more efficient to pick these up first)
        var droppedResources = creep.room.find(FIND_DROPPED_RESOURCES, {
            filter: resource => resource.resourceType == RESOURCE_ENERGY && resource.amount > 100
        });
        
        if(droppedResources.length > 0) {
            // Sort by amount and distance combined score
            droppedResources.sort((a, b) => {
                const aScore = a.amount - (creep.pos.getRangeTo(a) * 5);
                const bScore = b.amount - (creep.pos.getRangeTo(b) * 5);
                return bScore - aScore;
            });
            
            // Register this target to prevent multiple haulers going for it
            this.registerCollectionTarget(creep, droppedResources[0], 'dropped');
            
            return droppedResources[0];
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
            // Sort containers by energy content and distance
            containers.sort((a, b) => {
                const aScore = a.store[RESOURCE_ENERGY] - (creep.pos.getRangeTo(a) * 5);
                const bScore = b.store[RESOURCE_ENERGY] - (creep.pos.getRangeTo(b) * 5);
                return bScore - aScore;
            });
            
            // Register this target
            this.registerCollectionTarget(creep, containers[0], 'container');
            
            return containers[0];
        }
        
        // Check for ruins with energy
        var ruins = creep.room.find(FIND_RUINS, {
            filter: (ruin) => ruin.store[RESOURCE_ENERGY] > 0
        });
        
        if(ruins.length > 0) {
            // Sort ruins by amount of energy and distance
            ruins.sort((a, b) => {
                const aScore = a.store[RESOURCE_ENERGY] - (creep.pos.getRangeTo(a) * 5);
                const bScore = b.store[RESOURCE_ENERGY] - (creep.pos.getRangeTo(b) * 5);
                return bScore - aScore;
            });
            
            // Register this target
            this.registerCollectionTarget(creep, ruins[0], 'ruin');
            
            return ruins[0];
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
            
            // Register this target
            this.registerCollectionTarget(creep, smallDropped[0], 'dropped');
            
            return smallDropped[0];
        }
        
        // No suitable targets found
        return null;
    },
    
    /**
     * Register a collection target to prevent multiple haulers going for same resource
     */
    registerCollectionTarget: function(creep, target, type) {
        if(!Memory.collectionTargets) {
            Memory.collectionTargets = {};
        }
        
        // Store the target and timestamp
        Memory.collectionTargets[target.id] = {
            hauler: creep.name,
            timestamp: Game.time,
            type: type
        };
        
        // Clean up old entries
        for(const id in Memory.collectionTargets) {
            if(Game.time - Memory.collectionTargets[id].timestamp > 50) {
                delete Memory.collectionTargets[id];
            }
        }
    },
    
    /**
     * Collect energy from a target based on its type
     */
    collectFromTarget: function(creep, target) {
        if(!target) return false;
        
        // Different collection based on target type
        if(target.resourceType) {
            // It's a dropped resource
            if(creep.pickup(target) === ERR_NOT_IN_RANGE) {
                moveCoordinator.moveTo(creep, target, {
                    visualizePathStyle: {stroke: '#ffaa00'}, 
                    reusePath: 5
                });
            }
            return true;
        } else if(target.store) {
            // It's a structure or ruin with a store
            if(creep.withdraw(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                moveCoordinator.moveTo(creep, target, {
                    visualizePathStyle: {stroke: '#ffaa00'}, 
                    reusePath: 5
                });
            }
            return true;
        }
        
        return false;
    },
    
    /**
     * Follow a harvester to collect dropped energy
     */
    followHarvester: function(creep) {
        // Find harvesters in this room
        var harvesters = _.filter(Game.creeps, c => 
            c.memory.role === 'harvester' && 
            c.room.name === creep.room.name
        );
        
        if(harvesters.length > 0) {
            // Assign to a specific harvester if not already assigned
            if(!creep.memory.targetHarvester || !Game.creeps[creep.memory.targetHarvester]) {
                // Distribute haulers evenly among harvesters
                const harvesterNum = creep.memory.number % harvesters.length;
                creep.memory.targetHarvester = harvesters[harvesterNum].name;
            }
            
            const harvester = Game.creeps[creep.memory.targetHarvester];
            if(harvester) {
                creep.say('👀 H-ver');
                moveCoordinator.moveTo(creep, harvester, {
                    visualizePathStyle: {stroke: '#ffaa00'}, 
                    reusePath: 5,
                    range: 1 // Stay close to pick up dropped energy
                });
                return true;
            } else {
                // Target harvester no longer exists, reset
                delete creep.memory.targetHarvester;
            }
        } 
        
        // Last resort: try direct harvesting from closest source
        var sources = creep.room.find(FIND_SOURCES_ACTIVE);
        if(sources.length > 0) {
            // Sort by distance
            sources.sort((a, b) => creep.pos.getRangeTo(a) - creep.pos.getRangeTo(b));
            
            if(creep.harvest(sources[0]) == ERR_NOT_IN_RANGE) {
                moveCoordinator.moveTo(creep, sources[0], {
                    visualizePathStyle: {stroke: '#ffaa00'}, 
                    reusePath: 5
                });
            }
            return true;
        } else {
            creep.say('⚠️ No src!');
            // Move to center to avoid blocking
            moveCoordinator.moveTo(creep, new RoomPosition(25, 25, creep.room.name), {
                visualizePathStyle: {stroke: '#ff0000'}
            });
            return false;
        }
    }
};