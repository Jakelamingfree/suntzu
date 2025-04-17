var roleHauler = {

    /** @param {Creep} creep **/
    run: function(creep) {
        if (creep.store.getFreeCapacity() > 0) {
            // Find energy on the ground
            const droppedEnergy = creep.room.find(FIND_DROPPED_RESOURCES, {
                filter: resource => resource.resourceType == RESOURCE_ENERGY
            });
            
            // Only proceed if we found energy
            if (droppedEnergy.length > 0) {
                // Find the closest energy on the ground
                const closestDroppedEnergy = creep.pos.findClosestByRange(droppedEnergy);
                if (closestDroppedEnergy) {
                    // Try to pickup the energy. If it's not in range
                    if (creep.pickup(closestDroppedEnergy) == ERR_NOT_IN_RANGE) {
                        // Move to it
                        creep.moveTo(closestDroppedEnergy, { visualizePathStyle: { stroke: '#ffaa00' } });
                    }
                    return; // Early return if we're handling dropped energy
                }
            }
            
            // If there's no dropped energy, look for energy in containers
            const containers = creep.room.find(FIND_STRUCTURES, {
                filter: structure => structure.structureType == STRUCTURE_CONTAINER && 
                                   structure.store[RESOURCE_ENERGY] > 0
            });
            
            if (containers.length > 0) {
                const closestContainer = creep.pos.findClosestByRange(containers);
                if (creep.withdraw(closestContainer, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(closestContainer, { visualizePathStyle: { stroke: '#ffaa00' } });
                }
                return;
            }
            
            // If nothing to collect, wait in a strategic location
            // (near spawn or sources depending on preference)
            this.waitStrategically(creep);
            
        } else {
            // Prioritize energy delivery to structures that need it
            const targets = creep.room.find(FIND_STRUCTURES, {
                filter: structure => {
                    // Priority order: Spawns, Extensions, Towers
                    return (
                        // Spawns that need energy
                        (structure.structureType == STRUCTURE_SPAWN && 
                         structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0) ||
                        // Extensions that need energy
                        (structure.structureType == STRUCTURE_EXTENSION && 
                         structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0) ||
                        // Towers below 80% energy
                        (structure.structureType == STRUCTURE_TOWER && 
                         structure.store.getFreeCapacity(RESOURCE_ENERGY) > 200) ||
                        // Storage as a last resort
                        (structure.structureType == STRUCTURE_STORAGE && 
                         structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0)
                    );
                }
            });
            
            // Sort targets by priority (spawns first, then extensions, then towers)
            targets.sort((a, b) => {
                const priority = {
                    [STRUCTURE_SPAWN]: 1,
                    [STRUCTURE_EXTENSION]: 2,
                    [STRUCTURE_TOWER]: 3, 
                    [STRUCTURE_STORAGE]: 4
                };
                return priority[a.structureType] - priority[b.structureType];
            });
            
            if (targets.length > 0) {
                // Try to transfer to the highest priority target
                if (creep.transfer(targets[0], RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(targets[0], { visualizePathStyle: { stroke: '#ffaa00' } });
                }
            } else {
                // If nowhere to deliver energy, wait near spawn/sources
                this.waitStrategically(creep);
            }
        }
    },
    
    waitStrategically: function(creep) {
        // Find a strategic location to wait - near spawn or sources
        const spawn = creep.room.find(FIND_MY_SPAWNS)[0];
        if (spawn) {
            // Wait near spawn, but not right on top of it
            const waitPos = new RoomPosition(
                spawn.pos.x + 3, 
                spawn.pos.y + 3, 
                spawn.pos.roomName
            );
            creep.moveTo(waitPos, { visualizePathStyle: { stroke: '#ffaa00' } });
        }
    }
};

module.exports = roleHauler;