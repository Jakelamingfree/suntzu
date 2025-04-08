var roleHarvester = {
    /** @param {Creep} creep **/
    run: function(creep) {
        // Debug visualization - show source assignment
        if(creep.memory.sourceId) {
            var source = Game.getObjectById(creep.memory.sourceId);
            if(source) {
                creep.room.visual.line(creep.pos, source.pos, {color: '#ffaa00', lineStyle: 'dashed'});
            }
        }
        
        // Ensure source ID is assigned
        if(!creep.memory.sourceId) {
            // Find available sources and distribute harvesters
            var sources = creep.room.find(FIND_SOURCES);
            if(sources.length > 0) {
                // Make sure creep.memory.number exists
                if(creep.memory.number === undefined) {
                    creep.memory.number = 0;
                }
                var sourceIndex = creep.memory.number % sources.length;
                creep.memory.sourceId = sources[sourceIndex].id;
                console.log(`Harvester ${creep.name} assigned to source ${creep.memory.sourceId}`);
            } else {
                // No sources found, this shouldn't happen in normal gameplay
                console.log(creep.name + ' could not find any sources!');
                // Move to the center of the room if we can't find sources
                creep.moveTo(new RoomPosition(25, 25, creep.room.name));
                return; // Exit the function early
            }
        }
        
        var source = Game.getObjectById(creep.memory.sourceId);
        
        // Make sure the source exists
        if(!source) {
            // The source might have been incorrectly stored or no longer exists
            // Reset the sourceId so it gets reassigned next tick
            creep.memory.sourceId = null;
            return; // Exit the function early
        }
        
        // If there's no container near the source yet, we need to build one
        var container = this.findSourceContainer(source);
        
        if(!container) {
            // Look for construction site for container
            var constructionSite = source.pos.findInRange(FIND_CONSTRUCTION_SITES, 1, {
                filter: s => s.structureType == STRUCTURE_CONTAINER
            })[0];
            
            // If no construction site exists, create one
            if(!constructionSite) {
                // Find valid position near source for container
                var positions = this.findBuildablePositionsNear(source);
                
                // If we found a valid position, create construction site
                if(positions.length > 0) {
                    var result = creep.room.createConstructionSite(positions[0], STRUCTURE_CONTAINER);
                    console.log(`Harvester ${creep.name} creating container site near source: ${result}`);
                }
            }
            
            // If construction site exists, try to build it
            if(constructionSite) {
                // First, make sure we're at an optimal position for both harvesting and building
                if(!creep.pos.inRangeTo(source, 1) || !creep.pos.inRangeTo(constructionSite, 3)) {
                    // Find a position that's adjacent to the source and close to the construction site
                    creep.moveTo(source, {visualizePathStyle: {stroke: '#ffaa00'}});
                } else {
                    // We're in position - harvest energy if needed
                    if(creep.store.getFreeCapacity() > 0) {
                        creep.harvest(source);
                    } else {
                        // Use energy to build the container
                        creep.build(constructionSite);
                    }
                }
            } else {
                // No container yet and no construction site - harvest and drop energy
                // Ensure we're next to the source
                if(creep.harvest(source) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(source, {visualizePathStyle: {stroke: '#ffaa00'}});
                    creep.say('⛏️ moving');
                } else {
                    creep.say('⛏️ mining');
                }
                
                // Drop energy if we're full to make it available for haulers
                if(creep.store.getFreeCapacity() == 0) {
                    creep.drop(RESOURCE_ENERGY);
                    creep.say('💧 drop');
                }
            }
        } else {
            // Container exists, stand on it and harvest
            if(!creep.pos.isEqualTo(container.pos)) {
                creep.moveTo(container.pos, {visualizePathStyle: {stroke: '#ffaa00'}});
                creep.say('🏠 contain');
            } else {
                // We're on the container - harvest
                creep.harvest(source);
                creep.say('⛏️ mining');
                // Energy automatically goes into the container we're standing on
            }
        }
    },
    
    /**
     * Find a container near the source
     */
    findSourceContainer: function(source) {
        // Look for containers near the source
        var containers = source.pos.findInRange(FIND_STRUCTURES, 1, {
            filter: s => s.structureType == STRUCTURE_CONTAINER
        });
        
        return containers.length > 0 ? containers[0] : null;
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
    }
};

module.exports = roleHarvester;