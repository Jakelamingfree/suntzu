var roleHarvester = {
    /** @param {Creep} creep **/
    run: function(creep) {
        // Assign a source if not already assigned
        if(!creep.memory.sourceId) {
            // Find available sources and distribute harvesters
            var sources = creep.room.find(FIND_SOURCES);
            var sourceIndex = creep.memory.number % sources.length;
            creep.memory.sourceId = sources[sourceIndex].id;
        }
        
        var source = Game.getObjectById(creep.memory.sourceId);
        
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
                    creep.room.createConstructionSite(positions[0], STRUCTURE_CONTAINER);
                }
            }
            
            // Still need to harvest and deliver until container is built
            if(creep.store.getFreeCapacity() > 0) {
                if(creep.harvest(source) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(source, {visualizePathStyle: {stroke: '#ffaa00'}});
                }
            } else {
                // Find targets to deliver energy to
                var targets = creep.room.find(FIND_STRUCTURES, {
                    filter: (structure) => {
                        return (structure.structureType == STRUCTURE_EXTENSION ||
                            structure.structureType == STRUCTURE_SPAWN ||
                            structure.structureType == STRUCTURE_TOWER) &&
                            structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
                    }
                });
                
                if(targets.length > 0) {
                    if(creep.transfer(targets[0], RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                        creep.moveTo(targets[0], {visualizePathStyle: {stroke: '#ffffff'}});
                    }
                }
            }
        } else {
            // Container exists, stay put and harvest
            
            // If not in position, move to optimal harvesting position
            if(!this.isInHarvestPosition(creep, source, container)) {
                this.moveToHarvestPosition(creep, source, container);
                return;
            }
            
            // In position, harvest and transfer to container
            creep.harvest(source);
            
            // If container is not full, transfer energy
            if(container.store.getFreeCapacity(RESOURCE_ENERGY) > 0 && creep.store.getUsedCapacity() > 0) {
                creep.transfer(container, RESOURCE_ENERGY);
            }
            
            // If container is damaged, repair it
            if(container.hits < container.hitsMax * 0.8) {
                creep.repair(container);
            }
        }
    },
    
    findSourceContainer: function(source) {
        return source.pos.findInRange(FIND_STRUCTURES, 1, {
            filter: s => s.structureType == STRUCTURE_CONTAINER
        })[0];
    },
    
    isInHarvestPosition: function(creep, source, container) {
        return creep.pos.isEqualTo(container.pos);
    },
    
    moveToHarvestPosition: function(creep, source, container) {
        creep.moveTo(container, {visualizePathStyle: {stroke: '#ffaa00'}});
    },
    
    findBuildablePositionsNear: function(source) {
        var positions = [];
        var room = source.room;
        
        // Check all adjacent tiles
        for(var dx = -1; dx <= 1; dx++) {
            for(var dy = -1; dy <= 1; dy++) {
                // Skip the source itself
                if(dx == 0 && dy == 0) continue;
                
                var x = source.pos.x + dx;
                var y = source.pos.y + dy;
                
                // Make sure position is inside room bounds
                if(x < 1 || x > 48 || y < 1 || y > 48) continue;
                
                var pos = new RoomPosition(x, y, room.name);
                
                // Check if position is valid for building (not a wall, swamp is ok)
                var terrain = Game.map.getRoomTerrain(room.name);
                if(terrain.get(x, y) !== TERRAIN_MASK_WALL) {
                    // Make sure there are no other structures or construction sites here
                    var structures = pos.lookFor(LOOK_STRUCTURES);
                    var constructionSites = pos.lookFor(LOOK_CONSTRUCTION_SITES);
                    
                    if(structures.length == 0 && constructionSites.length == 0) {
                        positions.push(pos);
                    }
                }
            }
        }
        
        return positions;
    }
};

module.exports = roleHarvester;