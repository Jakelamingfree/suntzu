// role.harvester.js – Harvester role logic (stationary mining next to a source & container)

const roleHarvester = {
    /** @param {Creep} creep **/
    run: function(creep) {
        // Ensure this creep has an assigned source (from Memory or choose one if not set)
        if (!creep.memory.sourceId) {
            // Find a source that is not already taken by another harvester
            const sources = creep.room.find(FIND_SOURCES);
            for (const src of sources) {
                if (!_.some(Game.creeps, c => c.memory.role === 'harvester' && c.memory.sourceId === src.id && c.name !== creep.name)) {
                    creep.memory.sourceId = src.id;
                    break;
                }
            }
        }
        const source = Game.getObjectById(creep.memory.sourceId);
        if (!source) {
            // No source found, nothing to do
            return;
        }

        // If a container is present near the source, get its reference
        // We assume container built at the source or the harvester stands on it
        let container = null;
        if (creep.memory.containerId) {
            container = Game.getObjectById(creep.memory.containerId);
            // If container stored in memory but not found (maybe removed), clear it
            if (!container) creep.memory.containerId = null;
        }
        if (!container) {
            // Try to find a container at the harvest position (on or adjacent to the source)
            const containers = source.pos.findInRange(FIND_STRUCTURES, 1, {
                filter: s => s.structureType === STRUCTURE_CONTAINER
            });
            if (containers.length > 0) {
                container = containers[0];
                creep.memory.containerId = container.id;
            }
        }

        if (container) {
            // **3. Container Mining Logic**: 
            // Move to the container (stationary position) and mine. "Sleep" if container is full.
            if (!creep.pos.isEqualTo(container.pos)) {
                // Move onto the container if not already there (so energy drops into it)
                creep.moveTo(container.pos, { visualizePathStyle: { stroke: '#ffaa00' } });
            } else {
                // If container is full, pause harvesting (to avoid wasting energy drops)
                if (container.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
                    // Container is full – do nothing (idle until hauler clears it)
                    // Optionally, creep.say('Zzz'); to indicate sleeping.
                } else {
                    // Container has space – harvest the source
                    if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
                        // Creep can still carry energy (buffer not full), continue harvesting
                        creep.harvest(source);
                    } else {
                        // Creep's carry is full – transfer to container to empty it out
                        creep.transfer(container, RESOURCE_ENERGY);
                        // After transferring, creep will resume harvesting next tick
                    }
                }
            }
        } else {
            // No container (fallback to direct harvesting and delivering to spawn/extensions)
            // This scenario typically happens in the very early game before containers are built.
            if (!creep.memory.delivering) {
                // If not currently delivering, ensure creep is at the source harvesting
                if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
                    // Still have space, harvest the source
                    if (!creep.pos.isNearTo(source)) {
                        creep.moveTo(source, { visualizePathStyle: { stroke: '#ffaa00' } });
                    } else {
                        creep.harvest(source);
                    }
                } else {
                    // Creep is full of energy, switch to delivering mode
                    creep.memory.delivering = true;
                }
            } 
            if (creep.memory.delivering) {
                // If delivering and creep has no energy left, switch back to harvesting mode
                if (creep.store[RESOURCE_ENERGY] === 0) {
                    creep.memory.delivering = false;
                    return;
                }
                // Find closest spawn or extension that is not full
                const target = creep.pos.findClosestByRange(FIND_MY_STRUCTURES, {
                    filter: structure => {
                        return (structure.structureType === STRUCTURE_SPAWN || structure.structureType === STRUCTURE_EXTENSION) &&
                               structure.store && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
                    }
                });
                if (target) {
                    // Move to the target and transfer energy
                    if (!creep.pos.isNearTo(target)) {
                        creep.moveTo(target, { visualizePathStyle: { stroke: '#ffffff' } });
                    } else {
                        creep.transfer(target, RESOURCE_ENERGY);
                    }
                } else {
                    // No valid target (spawn/extensions might be full) – 
                    // in this case, just hold or drop the energy to not block harvesting.
                    // We'll drop it on the ground to free the carry and continue harvesting.
                    creep.drop(RESOURCE_ENERGY);
                    creep.memory.delivering = false;
                }
            }
        }
    }
};

module.exports = roleHarvester;
