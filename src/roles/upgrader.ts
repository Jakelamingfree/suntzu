import "./types";

export const roleUpgrader: CreepRole = {
    run(creep: Creep): void {
        // State management
        if (creep.memory.working && creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.working = false;
        }
        if (!creep.memory.working && creep.store.getFreeCapacity() === 0) {
            creep.memory.working = true;
        }

        if (creep.memory.working) {
            // Upgrading controller
            if (creep.room.controller && creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
                creep.moveTo(creep.room.controller, {visualizePathStyle: {stroke: '#ffffff'}});
            }
        } else {
            // Getting energy
            // First try to get energy from storage if available
            if (creep.room.storage && creep.room.storage.store[RESOURCE_ENERGY] > 100) {
                if (creep.withdraw(creep.room.storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(creep.room.storage, {visualizePathStyle: {stroke: '#ffaa00'}});
                }
                return;
            }
            
            // Then try to get energy from containers
            const containers = creep.room.find(FIND_STRUCTURES, {
                filter: (s: Structure) => 
                    s.structureType === STRUCTURE_CONTAINER && 
                    (s as StructureContainer).store[RESOURCE_ENERGY] > 50
            }) as StructureContainer[];
            
            if (containers.length > 0) {
                // Sort by amount of energy
                containers.sort((a, b) => b.store[RESOURCE_ENERGY] - a.store[RESOURCE_ENERGY]);
                if (creep.withdraw(containers[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(containers[0], {visualizePathStyle: {stroke: '#ffaa00'}});
                }
                return;
            }
            
            // Finally, harvest from source if no stored energy is available
            const source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
            if (source && creep.harvest(source) === ERR_NOT_IN_RANGE) {
                creep.moveTo(source, {visualizePathStyle: {stroke: '#ffaa00'}});
            }
        }
    }
};

module.exports = roleUpgrader;
