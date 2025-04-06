import "../types";
import { movement } from '../utils/movement';

export const roleHauler: CreepRole = {
    run(creep: Creep): void {
        // Initialize memory if needed
        if (creep.memory.homeRoom === undefined) {
            creep.memory.homeRoom = creep.room.name;
        }
        
        // If creep is full, switch to delivering mode
        if (creep.store.getFreeCapacity() === 0 && !creep.memory.delivering) {
            creep.memory.delivering = true;
        }
        // If creep is empty, switch to collecting mode
        if (creep.store[RESOURCE_ENERGY] === 0 && creep.memory.delivering) {
            creep.memory.delivering = false;
        }

        // If we're supposed to deliver energy
        if (creep.memory.delivering) {
            // Make sure we're in the home room
            if (creep.memory.homeRoom && creep.room.name !== creep.memory.homeRoom) {
                movement.moveToRoom(creep, creep.memory.homeRoom);
                return;
            }
            
            // First, fill spawns and extensions
            const priority = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
                filter: (s: Structure) => (
                    (s.structureType === STRUCTURE_EXTENSION || s.structureType === STRUCTURE_SPAWN) &&
                    (s as StructureExtension | StructureSpawn).store.getFreeCapacity(RESOURCE_ENERGY) > 0
                )
            }) as StructureExtension | StructureSpawn;
            
            if (priority) {
                if (creep.transfer(priority, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(priority, {visualizePathStyle: {stroke: '#ffffff'}});
                }
                return;
            }
            
            // Then fill towers if they're below 80%
            const tower = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
                filter: (s: Structure) => (
                    s.structureType === STRUCTURE_TOWER && 
                    (s as StructureTower).store.getFreeCapacity(RESOURCE_ENERGY) > 
                    0.2 * (s as StructureTower).store.getCapacity(RESOURCE_ENERGY)
                )
            }) as StructureTower;
            
            if (tower) {
                if (creep.transfer(tower, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(tower, {visualizePathStyle: {stroke: '#ffffff'}});
                }
                return;
            }
            
            // Finally, store in storage if everything else is full
            if (creep.room.storage) {
                if (creep.transfer(creep.room.storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(creep.room.storage, {visualizePathStyle: {stroke: '#ffffff'}});
                }
                return;
            }
            
            // If nowhere to store, help upgrade the controller
            if (creep.room.controller && 
                creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
                creep.moveTo(creep.room.controller, {visualizePathStyle: {stroke: '#ffffff'}});
            }
        }
        // Otherwise, go collect energy
        else {
            // Check for dropped resources first within the current room
            const droppedResource = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {
                filter: (r: Resource) => r.resourceType === RESOURCE_ENERGY && r.amount > 50
            });
            
            if (droppedResource) {
                if (creep.pickup(droppedResource) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(droppedResource, {visualizePathStyle: {stroke: '#ffaa00'}});
                }
                return;
            }
            
            // Then check containers/storage
            const containers = creep.room.find(FIND_STRUCTURES, {
                filter: (s: Structure) => (
                    (s.structureType === STRUCTURE_CONTAINER || s.structureType === STRUCTURE_STORAGE) && 
                    (s as StructureContainer | StructureStorage).store[RESOURCE_ENERGY] > creep.store.getFreeCapacity()
                )
            }) as (StructureContainer | StructureStorage)[];
            
            // Sort by amount of energy (descending)
            containers.sort((a, b) => b.store[RESOURCE_ENERGY] - a.store[RESOURCE_ENERGY]);
            
            if (containers.length > 0) {
                if (creep.withdraw(containers[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(containers[0], {visualizePathStyle: {stroke: '#ffaa00'}});
                }
                return;
            }
            
            // If we have a source container assigned, go to that room and collect
            if (creep.memory.sourceContainer) {
                const container = Game.getObjectById(creep.memory.sourceContainer) as StructureContainer;
                if (container) {
                    // If we need to travel to another room
                    if (creep.room.name !== container.room.name) {
                        movement.moveToRoom(creep, container.room.name);
                        return;
                    }
                    
                    if (creep.withdraw(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                        creep.moveTo(container, {visualizePathStyle: {stroke: '#ffaa00'}});
                    }
                    return;
                }
            }
            
            // Fall back to harvesting if nothing else is available
            const source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
            if (source) {
                if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(source, {visualizePathStyle: {stroke: '#ffaa00'}});
                }
            }
        }
    },
    
    // Function to assign a dedicated source/container to this hauler
    assignContainer(creep: Creep, room: Room): boolean {
        // Initialize if not already done
        if (!room.memory.haulerAssignments) {
            room.memory.haulerAssignments = {};
        }
        
        // Find all containers in the room and near sources
        const containers = room.find(FIND_STRUCTURES, {
            filter: (s: Structure) => s.structureType === STRUCTURE_CONTAINER
        }) as StructureContainer[];
        
        // Find source-adjacent containers
        const sourceContainers: string[] = [];
        for (const container of containers) {
            const sources = container.pos.findInRange(FIND_SOURCES, 1);
            if (sources.length > 0) {
                sourceContainers.push(container.id);
            }
        }
        
        // Find the least assigned container
        let leastAssigned: string | null = null;
        let leastCount = Infinity;
        
        for (const containerId of sourceContainers) {
            const count = Object.values(room.memory.haulerAssignments)
                .filter(id => id === containerId).length;
            
            if (count < leastCount) {
                leastCount = count;
                leastAssigned = containerId;
            }
        }
        
        // Assign container to this hauler
        if (leastAssigned) {
            creep.memory.sourceContainer = leastAssigned;
            room.memory.haulerAssignments[creep.name] = leastAssigned;
            return true;
        }
        
        return false;
    }
};
