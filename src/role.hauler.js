// role.hauler.js – Hauler role logic (collects energy from containers and delivers to spawn/extensions)

const roleHauler = {
    /** 
     * @param {Creep} creep 
     * This function runs the hauler logic with improved remote operations support
     * Handles the 2:1 hauler-to-harvester ratio more efficiently
     */
    run: function(creep) {
        // If hauler has a target room assigned but isn't there yet, travel to it
        if (creep.memory.targetRoom && creep.room.name !== creep.memory.targetRoom) {
            const exitDir = Game.map.findExit(creep.room, creep.memory.targetRoom);
            const exit = creep.pos.findClosestByPath(exitDir);
            creep.moveTo(exit, { visualizePathStyle: { stroke: '#ffaa00' } });
            return;
        }
        // Check if creep is currently carrying energy or not
        if (creep.store[RESOURCE_ENERGY] === 0) {
            // Not carrying anything: ensure we're in "collecting" mode
            creep.memory.delivering = false;

            // If we have an assigned pickup target in memory, use it; otherwise find one
            let pickup = null;
            if (creep.memory.pickupTarget) {
                pickup = Game.getObjectById(creep.memory.pickupTarget);
                // If target is empty or gone, clear it so we find a new one
                if (!pickup || (pickup.structureType === STRUCTURE_CONTAINER && pickup.store[RESOURCE_ENERGY] === 0) ||
                               (pickup.resourceType === RESOURCE_ENERGY && pickup.amount === 0)) {
                    pickup = null;
                    creep.memory.pickupTarget = null;
                }
            }
            
            if (!pickup) {
                // Find the closest energy source (container or dropped resource) that has energy
                pickup = creep.pos.findClosestByPath(FIND_STRUCTURES, {
                    filter: s => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 0
                });
                
                // Also consider dropped energy on the ground as pickup (if no containers or in early game)
                const dropped = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {
                    filter: r => r.resourceType === RESOURCE_ENERGY && r.amount > 20  // Only consider drops of decent size
                });
                
                if (dropped && (!pickup || creep.pos.getRangeTo(dropped) < creep.pos.getRangeTo(pickup))) {
                    pickup = dropped;
                }
                
                // RCL 1 fallback - harvest directly when no containers/drops are available
                if (!pickup && creep.room.controller && creep.room.controller.level === 1) {
                    // Find an unoccupied source
                    const sources = creep.room.find(FIND_SOURCES);
                    const harvesters = _.filter(Game.creeps, c => c.memory.role === 'harvester');
                    
                    for (const source of sources) {
                        // Count how many creeps are already at this source
                        const creepsAtSource = creep.room.lookForAtArea(LOOK_CREEPS, 
                            Math.max(1, source.pos.y - 1), 
                            Math.max(1, source.pos.x - 1), 
                            Math.min(48, source.pos.y + 1), 
                            Math.min(48, source.pos.x + 1), 
                            true);
                            
                        // If no more than 1 creep is at this source, it's a viable target
                        if (creepsAtSource.length <= 1) {
                            creep.memory.harvestSource = source.id;
                            
                            if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
                                creep.moveTo(source, { visualizePathStyle: { stroke: '#ffaa00' } });
                            }
                            return;
                        }
                    }
                }
                
                // Store the target in memory to avoid multiple haulers taking the same resource
                if (pickup) {
                    creep.memory.pickupTarget = pickup.id;
                } else {
                    // No pickup source found, wait near spawn
                    const spawn = creep.pos.findClosestByPath(FIND_MY_SPAWNS);
                    if (spawn && !creep.pos.inRangeTo(spawn, 3)) {
                        creep.moveTo(spawn, { visualizePathStyle: { stroke: '#ffffff' } });
                    }
                    return;
                }
            }
            
            // Move to pickup location and withdraw or pick up energy
            if (pickup) {
                if (!creep.pos.isNearTo(pickup)) {
                    creep.moveTo(pickup, { visualizePathStyle: { stroke: '#ffaa00' } });
                } else {
                    if (pickup instanceof Resource) {
                        // It's a dropped resource on the ground
                        creep.pickup(pickup);
                    } else {
                        // It's a container or other structure with energy
                        creep.withdraw(pickup, RESOURCE_ENERGY);
                    }
                    // Clear the pickupTarget once we've collected (to allow others to target it if it still has more)
                    creep.memory.pickupTarget = null;
                }
            }
        } 
        // Direct harvesting logic (RCL1 fallback)
        else if (creep.memory.harvestSource) {
            creep.memory.harvestSource = null;  // Switch to delivery mode
            creep.memory.delivering = true;
        }
        
        if (creep.store[RESOURCE_ENERGY] > 0) {
            // Now carrying energy: switch to "delivering" mode
            creep.memory.delivering = true;

            // Find the closest spawn or extension that needs energy (not full)
            let target = creep.memory.deliveryTarget ? Game.getObjectById(creep.memory.deliveryTarget) : null;
            if (target && target.store && target.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
                // If the stored target is now full, clear it
                target = null;
                creep.memory.deliveryTarget = null;
            }
            
            if (!target) {
                // Priority 1: Spawn and extensions (energy for spawning)
                target = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
                    filter: structure => {
                        return (structure.structureType === STRUCTURE_SPAWN || structure.structureType === STRUCTURE_EXTENSION) &&
                               structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
                    }
                });
                
                // Priority 2: If spawn/extensions are full, deliver to controller upgraders
                if (!target && creep.room.controller) {
                    // Find an upgrader that needs energy
                    const upgraders = _.filter(Game.creeps, c => 
                        c.memory.role === 'upgrader' && 
                        c.store.getFreeCapacity(RESOURCE_ENERGY) > 0 &&
                        c.room.name === creep.room.name);
                        
                    if (upgraders.length > 0) {
                        // Find closest upgrader
                        const closestUpgrader = creep.pos.findClosestByPath(upgraders);
                        if (closestUpgrader) {
                            target = closestUpgrader;
                        }
                    }
                }
                
                if (target) {
                    creep.memory.deliveryTarget = target.id;
                }
            }
            
            if (target) {
                // Move to the target and transfer energy
                if (!creep.pos.isNearTo(target)) {
                    creep.moveTo(target, { visualizePathStyle: { stroke: '#ffffff' } });
                } else {
                    // If it's a creep, transfer energy to it
                    if (target instanceof Creep) {
                        creep.transfer(target, RESOURCE_ENERGY);
                    } else {
                        // It's a structure
                        creep.transfer(target, RESOURCE_ENERGY);
                    }
                    // If we've delivered all energy, clear the delivery target (to find others next time)
                    if (creep.store[RESOURCE_ENERGY] === 0) {
                        creep.memory.deliveryTarget = null;
                    }
                }
            } else {
                // All targets full - deposit at controller directly until we get upgraders
                if (creep.room.controller && !creep.room.controller.my) {
                    // Can't upgrade neutral controllers, just wait
                } else if (creep.room.controller) {
                    // Directly upgrade controller if nothing else to do
                    if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
                        creep.moveTo(creep.room.controller, { visualizePathStyle: { stroke: '#ffffff' } });
                    }
                }
            }
        }
    }
};

module.exports = roleHauler;