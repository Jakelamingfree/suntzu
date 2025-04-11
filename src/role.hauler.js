// role.hauler.js – Hauler role logic (collects energy from containers and delivers to spawn/extensions)

const roleHauler = {
    /** @param {Creep} creep **/
    run: function(creep) {
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
                    filter: r => r.resourceType === RESOURCE_ENERGY && r.amount > 0
                });
                if (dropped && (!pickup || creep.pos.getRangeTo(dropped) < creep.pos.getRangeTo(pickup))) {
                    pickup = dropped;
                }
                // Store the target in memory to avoid multiple haulers taking the same resource
                if (pickup) {
                    creep.memory.pickupTarget = pickup.id || pickup.name; // dropped resources have .id as well
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
                target = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
                    filter: structure => {
                        return (structure.structureType === STRUCTURE_SPAWN || structure.structureType === STRUCTURE_EXTENSION) &&
                               structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
                    }
                });
                if (target) {
                    creep.memory.deliveryTarget = target.id;
                }
            }
            if (target) {
                // Move to the target and transfer energy
                if (!creep.pos.isNearTo(target)) {
                    creep.moveTo(target, { visualizePathStyle: { stroke: '#ffffff' } });
                } else {
                    creep.transfer(target, RESOURCE_ENERGY);
                    // If we've delivered all energy, clear the delivery target (to find others next time)
                    if (creep.store[RESOURCE_ENERGY] === 0) {
                        creep.memory.deliveryTarget = null;
                    }
                }
            } else {
                // No target available (everything is full) – hold onto energy for now.
                // (In a full base scenario, harvesters will pause when containers fill up.)
            }
        }
    }
};

module.exports = roleHauler;
