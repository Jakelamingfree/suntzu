/**
 * Remote Harvester Role
 * - Harvests energy from identified remote rooms
 * - Operates similar to regular harvesters but in remote rooms
 * - Drops resources for haulers to collect
 */

var moveCoordinator = require('moveCoordinator');

var roleRemoteHarvester = {
    /** @param {Creep} creep **/
    run: function(creep) {
        // Initialize memory on first run
        if(!creep.memory.homeRoom) {
            creep.memory.homeRoom = creep.room.name;
        }
        
        // Assign remote room if not already assigned
        if(!creep.memory.targetRoom) {
            this.assignRemoteRoom(creep);
        }
        
        // If no remote room could be assigned, act as a regular harvester
        if(!creep.memory.targetRoom) {
            creep.say('🏠 Local');
            // Just harvest in the current room using normal harvesting logic
            this.harvestInCurrentRoom(creep);
            return;
        }
        
        // If we're in the home room and we're full, drop off in storage or containers
        if(creep.room.name === creep.memory.homeRoom && creep.store.getFreeCapacity() < creep.store.getCapacity() * 0.3) {
            this.dropOffEnergy(creep);
            return;
        }
        
        // If we're in the target room, harvest
        if(creep.room.name === creep.memory.targetRoom) {
            this.harvestInRemoteRoom(creep);
        } else if(creep.room.name === creep.memory.homeRoom && creep.store[RESOURCE_ENERGY] === 0) {
            // If we're in the home room with no energy, travel to target room
            this.travelToRemoteRoom(creep);
        } else if(creep.store.getFreeCapacity() === 0) {
            // If we're full, return to home room
            this.returnToHomeRoom(creep);
        } else {
            // Travel to target room if not there
            this.travelToRemoteRoom(creep);
        }
    },
    
    /**
     * Assign a remote room to the harvester
     */
    assignRemoteRoom: function(creep) {
        if(!Memory.remoteHarvestRooms || Memory.remoteHarvestRooms.length === 0) {
            console.log(`Remote harvester ${creep.name} couldn't find any remote harvesting rooms`);
            return;
        }
        
        // Count remote harvesters per room to distribute them evenly
        const remoteHarvesters = _.filter(Game.creeps, c => 
            c.memory.role === 'remoteHarvester' && c.memory.targetRoom
        );
        
        // Count harvesters per remote room
        const harvestersPerRoom = {};
        for(const harvester of remoteHarvesters) {
            if(!harvestersPerRoom[harvester.memory.targetRoom]) {
                harvestersPerRoom[harvester.memory.targetRoom] = 0;
            }
            harvestersPerRoom[harvester.memory.targetRoom]++;
        }
        
        // Find the room with the fewest harvesters
        let minHarvesters = Infinity;
        let selectedRoom = null;
        
        for(const roomName of Memory.remoteHarvestRooms) {
            const count = harvestersPerRoom[roomName] || 0;
            if(count < minHarvesters) {
                minHarvesters = count;
                selectedRoom = roomName;
            }
        }
        
        if(selectedRoom) {
            creep.memory.targetRoom = selectedRoom;
            console.log(`Remote harvester ${creep.name} assigned to room ${selectedRoom}`);
        }
    },
    
    /**
     * Travel to the assigned remote room
     */
    travelToRemoteRoom: function(creep) {
        const exitDir = Game.map.findExit(creep.room, creep.memory.targetRoom);
        if(exitDir === ERR_NO_PATH) {
            // No path to target room, try to pick a new room
            console.log(`Remote harvester ${creep.name} can't find path to ${creep.memory.targetRoom}`);
            delete creep.memory.targetRoom;
            this.assignRemoteRoom(creep);
            return;
        }
        
        const exit = creep.pos.findClosestByPath(exitDir);
        if(exit) {
            moveCoordinator.moveTo(creep, exit, {
                visualizePathStyle: {stroke: '#ffaa00'},
                reusePath: 50
            });
        }
    },
    
    /**
     * Return to home room
     */
    returnToHomeRoom: function(creep) {
        const exitDir = Game.map.findExit(creep.room, creep.memory.homeRoom);
        if(exitDir === ERR_NO_PATH) {
            // No path to home room
            creep.say('⚠️ No path');
            
            // Move to center of current room to try again
            creep.moveTo(new RoomPosition(25, 25, creep.room.name));
            return;
        }
        
        const exit = creep.pos.findClosestByPath(exitDir);
        if(exit) {
            moveCoordinator.moveTo(creep, exit, {
                visualizePathStyle: {stroke: '#ffaa00'},
                reusePath: 50
            });
        }
    },
    
    /**
     * Harvest in the remote room
     */
    harvestInRemoteRoom: function(creep) {
        // Assign a source if not already assigned
        if(!creep.memory.sourceId) {
            this.assignSourceInRoom(creep, creep.room);
        }
        
        // If we're full, head back home
        if(creep.store.getFreeCapacity() === 0) {
            creep.say('🏠 Return');
            this.returnToHomeRoom(creep);
            return;
        }
        
        // Get the assigned source
        const source = Game.getObjectById(creep.memory.sourceId);
        
        // If source exists, harvest from it
        if(source) {
            // Check for hostiles before harvesting
            if(this.checkForHostiles(creep)) {
                // Hostiles detected, flee back to home room
                creep.say('🚨 Hostiles!');
                this.returnToHomeRoom(creep);
                return;
            }
            
            // Look for a container near the source
            const container = source.pos.findInRange(FIND_STRUCTURES, 1, {
                filter: s => s.structureType === STRUCTURE_CONTAINER
            })[0];
            
            // If container exists, use it. Otherwise just harvest directly
            if(container) {
                if(!creep.pos.isEqualTo(container.pos)) {
                    // Move to container
                    moveCoordinator.moveTo(creep, container.pos, {
                        visualizePathStyle: {stroke: '#ffaa00'}
                    });
                    creep.say('🏠 Container');
                } else {
                    // On container, harvest
                    creep.harvest(source);
                    creep.say('⛏️ Remote');
                }
            } else {
                // Check for a construction site first
                const constructionSite = source.pos.findInRange(FIND_CONSTRUCTION_SITES, 1, {
                    filter: s => s.structureType === STRUCTURE_CONTAINER
                })[0];
                
                if(constructionSite) {
                    // If we're full, build the container
                    if(creep.store.getFreeCapacity() === 0) {
                        if(creep.build(constructionSite) === ERR_NOT_IN_RANGE) {
                            moveCoordinator.moveTo(creep, constructionSite, {
                                visualizePathStyle: {stroke: '#ffffff'}
                            });
                        }
                        return;
                    }
                    
                    // Otherwise harvest while in range of both source and construction site
                    if(!creep.pos.inRangeTo(source, 1) || !creep.pos.inRangeTo(constructionSite, 3)) {
                        moveCoordinator.moveTo(creep, source, {
                            visualizePathStyle: {stroke: '#ffaa00'}
                        });
                    } else {
                        creep.harvest(source);
                    }
                } else {
                    // No container or construction site yet
                    
                    // If we have a decent amount of energy, create a container construction site
                    if(creep.store[RESOURCE_ENERGY] >= 100) {
                        // Find valid position for container
                        const positions = this.findBuildablePositionsNear(source);
                        if(positions.length > 0) {
                            // Create construction site
                            const result = creep.room.createConstructionSite(positions[0], STRUCTURE_CONTAINER);
                            console.log(`Remote harvester ${creep.name} creating container site: ${result}`);
                        }
                    }
                    
                    // Just harvest normally
                    if(creep.harvest(source) === ERR_NOT_IN_RANGE) {
                        moveCoordinator.moveTo(creep, source, {
                            visualizePathStyle: {stroke: '#ffaa00'}
                        });
                        creep.say('⛏️ Moving');
                    } else {
                        creep.say('⛏️ Remote');
                    }
                }
            }
        } else {
            // Source no longer exists or invalid ID
            delete creep.memory.sourceId;
        }
    },
    
    /**
     * Check for hostiles in the current room
     */
    checkForHostiles: function(creep) {
        const hostiles = creep.room.find(FIND_HOSTILE_CREEPS);
        return hostiles.length > 0;
    },
    
    /**
     * Find buildable positions near a source
     */
    findBuildablePositionsNear: function(source) {
        var room = source.room;
        var terrain = room.getTerrain();
        var validPositions = [];
        
        // Check all positions around the source
        for(var dx = -1; dx <= 1; dx++) {
            for(var dy = -1; dy <= 1; dy++) {
                // Skip the source position itself
                if(dx == 0 && dy == 0) continue;
                
                var x = source.pos.x + dx;
                var y = source.pos.y + dy;
                
                // Make sure position is inside room bounds
                if(x < 1 || x > 48 || y < 1 || y > 48) continue;
                
                // Check if this position is walkable (not a wall)
                if(terrain.get(x, y) !== TERRAIN_MASK_WALL) {
                    // Check if there are any structures here already
                    var structures = room.lookForAt(LOOK_STRUCTURES, x, y);
                    if(structures.length === 0) {
                        // Valid position, add it to our list
                        validPositions.push(new RoomPosition(x, y, room.name));
                    }
                }
            }
        }
        
        // Return all valid positions
        return validPositions;
    },
    
    /**
     * Assign a source to the harvester in the current room
     */
    assignSourceInRoom: function(creep, room) {
        const sources = room.find(FIND_SOURCES);
        if(sources.length === 0) {
            console.log(`No sources found in room ${room.name} for remote harvester ${creep.name}`);
            return;
        }
        
        // Count harvesters per source
        const harvestersPerSource = {};
        const harvesters = _.filter(Game.creeps, c => 
            c.memory.role === 'remoteHarvester' && 
            c.memory.targetRoom === room.name && 
            c.memory.sourceId
        );
        
        for(const harvester of harvesters) {
            if(!harvestersPerSource[harvester.memory.sourceId]) {
                harvestersPerSource[harvester.memory.sourceId] = 0;
            }
            harvestersPerSource[harvester.memory.sourceId]++;
        }
        
        // Find the source with the fewest harvesters
        let minHarvesters = Infinity;
        let selectedSource = null;
        
        for(const source of sources) {
            const count = harvestersPerSource[source.id] || 0;
            if(count < minHarvesters) {
                minHarvesters = count;
                selectedSource = source;
            }
        }
        
        if(selectedSource) {
            creep.memory.sourceId = selectedSource.id;
            console.log(`Remote harvester ${creep.name} assigned to source ${selectedSource.id} in room ${room.name}`);
        }
    },
    
    /**
     * Drop off energy in storage or containers
     */
    dropOffEnergy: function(creep) {
        // Find storage or containers
        const storage = creep.room.find(FIND_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_STORAGE && 
                      s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        })[0];
        
        if(storage) {
            if(creep.transfer(storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                moveCoordinator.moveTo(creep, storage, {
                    visualizePathStyle: {stroke: '#ffffff'}
                });
            }
            return;
        }
        
        // No storage, find container
        const containers = creep.room.find(FIND_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_CONTAINER && 
                      s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        });
        
        if(containers.length > 0) {
            // Sort by distance
            containers.sort((a, b) => creep.pos.getRangeTo(a) - creep.pos.getRangeTo(b));
            
            if(creep.transfer(containers[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                moveCoordinator.moveTo(creep, containers[0], {
                    visualizePathStyle: {stroke: '#ffffff'}
                });
            }
            return;
        }
        
        // Check for spawn and extensions that need energy
        const spawnsAndExtensions = creep.room.find(FIND_STRUCTURES, {
            filter: s => (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION) &&
                      s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        });
        
        if(spawnsAndExtensions.length > 0) {
            // Sort by distance
            spawnsAndExtensions.sort((a, b) => creep.pos.getRangeTo(a) - creep.pos.getRangeTo(b));
            
            if(creep.transfer(spawnsAndExtensions[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                moveCoordinator.moveTo(creep, spawnsAndExtensions[0], {
                    visualizePathStyle: {stroke: '#ffffff'}
                });
            }
            return;
        }
        
        // No containers either, just drop the energy near spawns for haulers
        const spawns = creep.room.find(FIND_MY_SPAWNS);
        if(spawns.length > 0) {
            moveCoordinator.moveTo(creep, spawns[0], {
                visualizePathStyle: {stroke: '#ffffff'},
                range: 2
            });
            
            if(creep.pos.getRangeTo(spawns[0]) <= 2) {
                creep.drop(RESOURCE_ENERGY);
                creep.say('💧 Drop');
            }
            return;
        }
        
        // If no storage, containers, or spawns, just go back to remote harvesting
        creep.say('🔄 Return');
        this.travelToRemoteRoom(creep);
    },
    
    /**
     * Harvest energy in the current room like a normal harvester
     */
    harvestInCurrentRoom: function(creep) {
        // Find sources in the current room
        if(!creep.memory.sourceId) {
            const sources = creep.room.find(FIND_SOURCES);
            if(sources.length > 0) {
                // Make sure creep.memory.number exists
                if(creep.memory.number === undefined) {
                    creep.memory.number = 0;
                }
                var sourceIndex = creep.memory.number % sources.length;
                creep.memory.sourceId = sources[sourceIndex].id;
            }
        }
        
        const source = Game.getObjectById(creep.memory.sourceId);
        if(!source) {
            // Reset the sourceId so it gets reassigned next tick
            creep.memory.sourceId = null;
            return;
        }
        
        // Try to find a container near the source
        const container = source.pos.findInRange(FIND_STRUCTURES, 1, {
            filter: s => s.structureType == STRUCTURE_CONTAINER
        })[0];
        
        if(container) {
            // Container exists, stand on it and harvest
            if(!creep.pos.isEqualTo(container.pos)) {
                moveCoordinator.moveTo(creep, container.pos, {
                    visualizePathStyle: {stroke: '#ffaa00'}
                });
                creep.say('🏠 Container');
            } else {
                // We're on the container - harvest
                creep.harvest(source);
                creep.say('⛏️ Mining');
            }
        } else {
            // No container, just harvest normally
            if(creep.harvest(source) == ERR_NOT_IN_RANGE) {
                moveCoordinator.moveTo(creep, source, {
                    visualizePathStyle: {stroke: '#ffaa00'}
                });
                creep.say('⛏️ Moving');
            } else {
                creep.say('⛏️ Mining');
            }
            
            // If we're full, try to find storage or spawn to deliver to
            if(creep.store.getFreeCapacity() == 0) {
                this.dropOffEnergy(creep);
            }
        }
    }
};

module.exports = roleRemoteHarvester;