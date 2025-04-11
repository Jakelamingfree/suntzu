// role.harvester.js – Harvester role logic (stationary mining next to a source & container)

const roleHarvester = {
    /** @param {Creep} creep **/
    run: function(creep) {
        // Check if we need to travel to a different room
        if (creep.memory.targetRoom && creep.room.name !== creep.memory.targetRoom) {
            // Move to the target room
            creep.say('🌎 ' + creep.memory.targetRoom);
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
                creep.say('⚠️ No source');
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

        // Check if we're at RCL 1 (early game without containers)
        const isEarlyGame = (!container && creep.room.controller && creep.room.controller.level === 1);

        if (container) {
            // **Container Mining Logic**: 
            // Move to the container (stationary position) and mine. "Sleep" if container is full.
            if (!creep.pos.isEqualTo(container.pos)) {
                // Move onto the container if not already there (so energy drops into it)
                creep.moveTo(container.pos, { visualizePathStyle: { stroke: '#ffaa00' } });
                creep.say('🚶 to cont');
            } else {
                // If container is full, pause harvesting (to avoid wasting energy drops)
                if (container.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
                    // Container is full – do nothing (idle until hauler clears it)
                    creep.say('😴 full');
                } else {
                    // Container has space – harvest the source
                    if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
                        // Creep can still carry energy (buffer not full), continue harvesting
                        creep.harvest(source);
                        creep.say('⛏️ harvest');
                    } else {
                        // Creep's carry is full – transfer to container to empty it out
                        creep.transfer(container, RESOURCE_ENERGY);
                        creep.say('🔄 deposit');
                    }
                }
            }
        } else {
            // No container (early game or container not yet built)
            // Early game hybrid approach: harvest and deliver or drop
            
            // Move to source if not nearby
            if (!creep.pos.isNearTo(source)) {
                creep.moveTo(source, { visualizePathStyle: { stroke: '#ffaa00' } });
                creep.say('🚶 to src');
                return;
            }
            
            // Check if we're full of energy and need to deliver
            if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
                creep.memory.delivering = true;
            }
            
            // Check if we're out of energy and need to harvest
            if (creep.store[RESOURCE_ENERGY] === 0) {
                creep.memory.delivering = false;
            }
            
            if (!creep.memory.delivering) {
                // Not delivering - harvest energy
                creep.harvest(source);
                creep.say('⛏️ harvest');
            } else {
                // Delivering - find a target
                
                // Priority 1: Spawn and extensions
                let target = creep.pos.findClosestByRange(FIND_MY_STRUCTURES, {
                    filter: structure => {
                        return (structure.structureType === STRUCTURE_SPAWN || structure.structureType === STRUCTURE_EXTENSION) &&
                               structure.store && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
                    }
                });
                
                if (target) {
                    // Move to the target and transfer energy
                    if (!creep.pos.isNearTo(target)) {
                        creep.moveTo(target, { visualizePathStyle: { stroke: '#ffffff' } });
                        creep.say('🚚 deliver');
                    } else {
                        creep.transfer(target, RESOURCE_ENERGY);
                        creep.say('⚡ transfer');
                    }
                } else {
                    // No valid target (spawn/extensions might be full)
                    
                    // Priority 2: Check for haulers nearby that need energy
                    const haulers = creep.pos.findInRange(FIND_MY_CREEPS, 1, {
                        filter: c => c.memory.role === 'hauler' && c.store.getFreeCapacity(RESOURCE_ENERGY) > 0
                    });
                    
                    if (haulers.length > 0) {
                        creep.transfer(haulers[0], RESOURCE_ENERGY);
                        creep.say('🔋 to hauler');
                    } else {
                        // Priority 3: Just drop the energy to free up carrying capacity
                        // Drop it near the source so haulers can pick it up
                        creep.drop(RESOURCE_ENERGY);
                        creep.say('💧 dropping');
                        creep.memory.delivering = false;
                    }
                }
            }
        }
    }
};

module.exports = roleHarvester;