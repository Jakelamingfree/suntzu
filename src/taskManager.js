// taskManager.js – Central task manager for coordinating haulers (energy pickup and delivery)

const taskManager = {
    /** Assign tasks to haulers to avoid overlap and maximize efficiency. 
     *  Each hauler gets a pickup target (container or dropped energy) using a greedy strategy 
     *  (preferring the closest source of energy). Delivery targets are handled in the hauler logic.
     */
    assignTasks: function() {
        // Track containers (or drops) already reserved by a hauler this tick to prevent overlap
        const reservedTargets = new Set();

        // Iterate over all hauler creeps to assign them pickup tasks if needed
        for (const name in Game.creeps) {
            const creep = Game.creeps[name];
            if (creep.memory.role !== 'hauler') continue;

            // If creep is not carrying energy (i.e., available to pick up) and not already en route to a target
            if (creep.store[RESOURCE_ENERGY] === 0) {
                // If this hauler already has a pickup target assigned in memory, skip reassigning unless it's invalid
                if (creep.memory.pickupTarget) {
                    // If it's already reserved by someone else (shouldn't happen if we manage correctly) or has no energy, clear it
                    const target = Game.getObjectById(creep.memory.pickupTarget);
                    if (!target || (target.structureType === STRUCTURE_CONTAINER && target.store[RESOURCE_ENERGY] === 0)) {
                        creep.memory.pickupTarget = null;
                    } else {
                        // Target is still valid and reserved to this creep; mark as reserved and continue
                        reservedTargets.add(creep.memory.pickupTarget);
                        continue;
                    }
                }
                // Find the nearest energy source (container or dropped resource) that isn't reserved
                let target = creep.pos.findClosestByPath(FIND_STRUCTURES, {
                    filter: s => s.structureType === STRUCTURE_CONTAINER &&
                                 s.store[RESOURCE_ENERGY] > 0 && 
                                 !reservedTargets.has(s.id)
                });
                // Consider dropped energy as well
                let dropped = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {
                    filter: r => r.resourceType === RESOURCE_ENERGY && r.amount > 0 && !reservedTargets.has(r.id)
                });
                if (dropped && (!target || creep.pos.getRangeTo(dropped) < creep.pos.getRangeTo(target))) {
                    target = dropped;
                }
                if (target) {
                    // Reserve this target for this hauler
                    reservedTargets.add(target.id);
                    creep.memory.pickupTarget = target.id;
                }
            }
            // (No need to assign delivery targets here; haulers will handle delivery in their own logic)
        }
    }
};

module.exports = taskManager;
