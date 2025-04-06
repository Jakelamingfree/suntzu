import "../types";

export const roleBuilder: CreepRole = {
    run(creep: Creep): void {
        // State management
        if (creep.memory.working && creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.working = false;
        }
        if (!creep.memory.working && creep.store.getFreeCapacity() === 0) {
            creep.memory.working = true;
        }

        if (creep.memory.working) {
            // First look for construction sites
            const target = creep.pos.findClosestByPath(FIND_CONSTRUCTION_SITES);
            
            if (target) {
                if (creep.build(target) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(target, {visualizePathStyle: {stroke: '#ffffff'}});
                }
                return;
            }
            
            // If no construction sites, look for structures to repair
            const repairTarget = creep.pos.findClosestByPath(FIND_STRUCTURES, {
                filter: (s: Structure) => {
                    if (s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART) {
                        return s.hits < 10000; // Cap wall/rampart repair
                    } else {
                        return s.hits < s.hitsMax * 0.8; // Repair other structures below 80%
                    }
                }
            });
            
            if (repairTarget) {
                if (creep.repair(repairTarget) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(repairTarget, {visualizePathStyle: {stroke: '#ffffff'}});
                }
                return;
            }
            
            // If nothing to build or repair, help upgrade controller
            if (creep.room.controller && creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
                creep.moveTo(creep.room.controller, {visualizePathStyle: {stroke: '#ffffff'}});
            }
        } else {
            // Getting energy - prioritize storage and containers
            if (creep.room.storage && creep.room.storage.store[RESOURCE_ENERGY] > 100) {
                if (creep.withdraw(creep.room.storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(creep.room.storage, {visualizePathStyle: {stroke: '#ffaa00'}});
                }
                return;
            }
            
            const containers = creep.room.find(FIND_STRUCTURES, {
                filter: (s: Structure) => 
                    s.structureType === STRUCTURE_CONTAINER && 
                    (s as StructureContainer).store[RESOURCE_ENERGY] > 50
            }) as StructureContainer[];
            
            if (containers.length > 0) {
                containers.sort((a, b) => b.store[RESOURCE_ENERGY] - a.store[RESOURCE_ENERGY]);
                if (creep.withdraw(containers[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(containers[0], {visualizePathStyle: {stroke: '#ffaa00'}});
                }
                return;
            }
            
            // If no stored energy, harvest from source
            const source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
            if (source && creep.harvest(source) === ERR_NOT_IN_RANGE) {
                creep.moveTo(source, {visualizePathStyle: {stroke: '#ffaa00'}});
            }
        }
    }
};
