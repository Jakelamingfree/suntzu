import "../types";

export const roleHarvester: CreepRole = {
    run(creep: Creep): void {
        if (creep.store.getFreeCapacity() > 0) {
            const source = creep.pos.findClosestByPath(FIND_SOURCES);
            if (source && creep.harvest(source) === ERR_NOT_IN_RANGE) {
                creep.moveTo(source, {visualizePathStyle: {stroke: '#ffaa00'}});
            }
        } else {
            const target = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
                filter: (s: Structure) => (
                    (s.structureType === STRUCTURE_EXTENSION || 
                     s.structureType === STRUCTURE_SPAWN) &&
                    (s as StructureExtension | StructureSpawn).store.getFreeCapacity(RESOURCE_ENERGY) > 0
                )
            }) as StructureExtension | StructureSpawn;
            
            if (target) {
                if (creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(target, {visualizePathStyle: {stroke: '#ffffff'}});
                }
            } else if (creep.room.controller && 
                       creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
                creep.moveTo(creep.room.controller, {visualizePathStyle: {stroke: '#ffffff'}});
            }
        }
    }
};
