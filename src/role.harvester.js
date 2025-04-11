// role.harvester.js – Harvester role logic (stationary mining next to a source & container)

const roleHarvester = {
    /** @param {Creep} creep **/
    run: function(creep) {
        // Check if we need to travel to a different room
        if (creep.memory.targetRoom && creep.room.name !== creep.memory.targetRoom) {
            // Move to the target room
            const exitDir = Game.map.findExit(creep.room, creep.memory.targetRoom);
            const exit = creep.pos.findClosestByPath(exitDir);
            creep.moveTo(exit, { visualizePathStyle: { stroke: '#ffaa00' } });
            return;
        }
        
        // Handle remote sources (identified by room_x_y format)
        let source = null;
        if (creep.memory.sourceId && creep.memory.sourceId.includes('_')) {
            // Parse the remote source ID (format: roomName_x_y)
            const [roomName, x, y] = creep.memory.sourceId.split('_');
            
            // We need to be in the right room
            if (creep.room.name !== roomName) {
                creep.memory.targetRoom = roomName;
                return;
            }
            
            // Find the source at these coordinates
            const sources = creep.room.find(FIND_SOURCES);
            source = _.find(sources, s => s.pos.x == parseInt(x) && s.pos.y == parseInt(y));
            
            if (!source) {
                console.log(`Harvester ${creep.name} couldn't find source at ${x},${y} in room ${roomName}`);
            }
        } else {
            // Regular source ID
            source = Game.getObjectById(creep.memory.sourceId);
        }
        
        // Ensure this creep has an assigned source if none found
        if (!source && !creep.memory.sourceId) {
            // Find a source that is not already taken by another harvester
            const sources = creep.room.find(FIND_SOURCES);
            for (const src of sources) {
                if (!_.some(Game.creeps, c => c.memory.role === 'harvester' && c.memory.sourceId === src.id && c.name !== creep.name)) {
                    creep.memory.sourceId = src.id;
                    source = src;
                    break;
                }
            }
        }
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

        // Check if there are haulers in the room
        const haulers = _.filter(Game.creeps, c => 
            c.memory.role === 'hauler' && c.room.name === creep.room.name);
        const hasHaulers = haulers.length > 0;

        if (container) {
            // **Container Mining Logic**: 
            // Move to the container (stationary position) and mine. "Sleep" if container is full.
            if (!creep.pos.isEqualTo(container.pos)) {
                // Move onto the container if not already there (so energy drops into it)
                creep.moveTo(container.pos, { visualizePathStyle: { stroke: '#ffaa00' } });
            } else {
                // If container is full, pause harvesting (to avoid wasting energy drops)
                if (container.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
                    // Container is full – do nothing (idle until hauler clears it)
                } else {
                    // Container has space – harvest the source
                    if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
                        // Creep can still carry energy (buffer not full), continue harvesting
                        creep.harvest(source);
                    } else {
                        // Creep's carry is full – transfer to container to empty it out
                        creep.transfer(container, RESOURCE_ENERGY);
                    }
                }
            }
        } else if (hasHaulers) {
            // No container but haulers exist - stay at source and drop energy
            
            // Move to source if not nearby
            if (!creep.pos.isNearTo(source)) {
                creep.moveTo(source, { visualizePathStyle: { stroke: '#ffaa00' } });
                return;
            }
            
            // Harvest when not full
            if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
                creep.harvest(source);
            } else {
                // Just drop the energy by the source for haulers to pick up
                creep.drop(RESOURCE_ENERGY);
            }
        } else {
            // No container and no haulers - hybrid harvester/carrier mode
            
            // If not full of energy, go harvest
            if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0 && !creep.memory.delivering) {
                // Move to source and harvest
                if (!creep.pos.isNearTo(source)) {
                    creep.moveTo(source, { visualizePathStyle: { stroke: '#ffaa00' } });
                } else {
                    creep.harvest(source);
                }
            } else {
                // Full of energy or already in delivering mode
                creep.memory.delivering = true;
                
                // Find closest spawn/extension needing energy
                let target = creep.pos.findClosestByRange(FIND_MY_STRUCTURES, {
                    filter: structure => {
                        return (structure.structureType === STRUCTURE_SPAWN || 
                                structure.structureType === STRUCTURE_EXTENSION) &&
                               structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
                    }
                });
                
                if (target) {
                    // Move to the target and transfer energy
                    if (!creep.pos.isNearTo(target)) {
                        creep.moveTo(target, { visualizePathStyle: { stroke: '#ffffff' } });
                    } else {
                        creep.transfer(target, RESOURCE_ENERGY);
                        // Reset delivering flag only after transferring
                        creep.memory.delivering = false;
                    }
                } else {
                    // No valid target (spawn/extensions might be full)
                    // Return to the source and drop energy
                    if (!creep.pos.isNearTo(source)) {
                        creep.moveTo(source, { visualizePathStyle: { stroke: '#ffaa00' } });
                    } else {
                        creep.drop(RESOURCE_ENERGY);
                        creep.memory.delivering = false;
                    }
                }
            }
        }
    }
};

module.exports = roleHarvester;