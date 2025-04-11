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
                    
                    // Check if target is still valid
                    if (!target || 
                        (target.structureType === STRUCTURE_CONTAINER && target.store[RESOURCE_ENERGY] === 0) ||
                        (target instanceof Resource && target.amount === 0)) {
                        creep.memory.pickupTarget = null;
                    } else {
                        // Target is still valid and reserved to this creep; mark as reserved and continue
                        reservedTargets.add(creep.memory.pickupTarget);
                        continue;
                    }
                }
                
                // First, try to find containers with energy
                let containerTarget = creep.pos.findClosestByPath(FIND_STRUCTURES, {
                    filter: s => s.structureType === STRUCTURE_CONTAINER &&
                                 s.store[RESOURCE_ENERGY] > 0 && 
                                 !reservedTargets.has(s.id)
                });
                
                // Then, consider dropped energy (could be from harvesters dropping energy)
                let droppedTarget = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {
                    filter: r => r.resourceType === RESOURCE_ENERGY && 
                                r.amount > 20 && // Only consider significant drops
                                !reservedTargets.has(r.id)
                });
                
                // Choose the more optimal target - prefer closer targets
                let target = null;
                if (containerTarget && droppedTarget) {
                    // Calculate distances
                    const containerDist = creep.pos.getRangeTo(containerTarget);
                    const droppedDist = creep.pos.getRangeTo(droppedTarget);
                    
                    // Consider resource amount as a factor (prefer larger amounts)
                    const containerValue = containerTarget.store[RESOURCE_ENERGY];
                    const droppedValue = droppedTarget.amount;
                    
                    // Use distance and resource size to determine priority
                    // Simple formula: value / distance (higher is better)
                    const containerPriority = containerValue / Math.max(1, containerDist);
                    const droppedPriority = droppedValue / Math.max(1, droppedDist);
                    
                    target = (containerPriority >= droppedPriority) ? containerTarget : droppedTarget;
                } else {
                    target = containerTarget || droppedTarget;
                }
                
                // If a valid target was found, assign it
                if (target) {
                    // Reserve this target for this hauler
                    reservedTargets.add(target.id);
                    creep.memory.pickupTarget = target.id;
                    
                    // Debug output
                    if (target instanceof Resource) {
                        console.log(`Hauler ${creep.name} assigned to pickup ${target.amount} dropped energy`);
                    } else {
                        console.log(`Hauler ${creep.name} assigned to pickup from container (${target.store[RESOURCE_ENERGY]} energy)`);
                    }
                }
            }
        }
    },
    
    /**
     * Assign haulers to harvesters to maintain efficient operations
     * With a 2:1 hauler:harvester ratio, we need to distribute haulers properly
     */
    assignHaulersToHarvesters: function() {
        // Get all harvesters and haulers
        const harvesters = _.filter(Game.creeps, creep => creep.memory.role === 'harvester');
        const haulers = _.filter(Game.creeps, creep => creep.memory.role === 'hauler');
        
        // If no haulers, nothing to do
        if (haulers.length === 0) return;
        
        // First, clear all hauler assignments
        for (const hauler of haulers) {
            delete hauler.memory.assignedHarvester;
            delete hauler.memory.targetRoom;
        }
        
        // Simple assignment strategy: assign 2 haulers per harvester if possible
        let haulerIndex = 0;
        
        for (const harvester of harvesters) {
            // Try to assign up to 2 haulers to each harvester
            for (let i = 0; i < 2; i++) {
                if (haulerIndex < haulers.length) {
                    const hauler = haulers[haulerIndex];
                    hauler.memory.assignedHarvester = harvester.name;
                    
                    // If harvester is in another room, set target room for hauler
                    if (harvester.memory.targetRoom) {
                        hauler.memory.targetRoom = harvester.memory.targetRoom;
                    }
                    
                    haulerIndex++;
                }
            }
        }
        
        // Log the assignments
        if (Game.time % 20 === 0) {
            console.log(`Hauler assignments: ${haulerIndex} haulers assigned to ${harvesters.length} harvesters`);
        }
    },
    
    /**
     * Check and report colony status to help with debugging
     */
    reportStatus: function() {
        // Only run this report every 10 ticks to avoid console spam
        if (Game.time % 10 !== 0) return;
        
        // Log status for each room we control
        for (const roomName in Game.rooms) {
            const room = Game.rooms[roomName];
            
            // Only report for rooms we have visibility in
            if (!room.controller || !room.controller.my) continue;
            
            // Room info
            console.log(`=== Room ${roomName} (RCL: ${room.controller.level}) ===`);
            
            // Energy info
            console.log(`Energy: ${room.energyAvailable}/${room.energyCapacityAvailable}`);
            
            // Creep counts
            const creeps = _.filter(Game.creeps, c => c.room.name === roomName);
            const counts = _.countBy(creeps, c => c.memory.role);
            
            console.log(`Creep counts: ${JSON.stringify(counts)}`);
            
            // Container info
            const containers = room.find(FIND_STRUCTURES, {
                filter: s => s.structureType === STRUCTURE_CONTAINER
            });
            
            if (containers.length > 0) {
                console.log(`Containers: ${containers.length}`);
                for (let i = 0; i < containers.length; i++) {
                    console.log(`  Container ${i+1}: ${containers[i].store[RESOURCE_ENERGY]}/${containers[i].store.getCapacity()}`);
                }
            } else {
                console.log(`No containers yet (need RCL 2)`);
            }
            
            // Construction sites
            const sites = room.find(FIND_CONSTRUCTION_SITES);
            if (sites.length > 0) {
                console.log(`Construction sites: ${sites.length}`);
            }
        }
    }
};

module.exports = taskManager;