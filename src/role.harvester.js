var roleHarvester = {
    /** @param {Creep} creep **/
    run: function(creep) {
        // If the harvester doesn't have a source or mining position assigned yet
        if (!creep.memory.sourceId) {
            this.assignSource(creep);
        }
        if (creep.memory.sourceId && !creep.memory.miningPos) {
            this.assignMiningPosition(creep);
        }
        
        // Get the source using the stored ID
        const source = Game.getObjectById(creep.memory.sourceId);
        
        // If we have an assigned mining position
        if (creep.memory.miningPos) {
            const pos = creep.memory.miningPos;
            // If we're at our mining position, harvest
            if (creep.pos.x === pos.x && creep.pos.y === pos.y) {
                creep.harvest(source);
                if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
                    // Immediately drop the harvested energy on the ground
                    creep.drop(RESOURCE_ENERGY);
                }
            } else {
                // Move to our assigned mining position
                creep.moveTo(pos.x, pos.y, { visualizePathStyle: { stroke: '#ffaa00' } });
            }
        } else {
            // Fallback if no mining position is assigned
            // Try to get close to the source and harvest
            if (creep.harvest(source) == ERR_NOT_IN_RANGE) {
                creep.moveTo(source, { visualizePathStyle: { stroke: '#ffaa00' } });
            } else {
                // We're in range and harvesting, so drop the energy
                if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
                    creep.drop(RESOURCE_ENERGY);
                }
            }
        }
    },
    
    // Assign a source to the harvester
    assignSource: function(creep) {
        // Get all sources in the room
        const sources = creep.room.find(FIND_SOURCES);
        let bestScore = -1;
        let bestSource = null;
        
        // Score each source based on available spots and distance
        for (let source of sources) {
            // Skip if this source doesn't have memory yet
            if (!Memory.sources || !Memory.sources[source.id]) continue;
            
            // Count harvesters already assigned to this source
            const assignedHarvesters = _.filter(Game.creeps, c => 
                c.memory.role === 'harvester' && 
                c.memory.sourceId === source.id
            ).length;
            
            // Skip if this source is fully assigned
            if (assignedHarvesters >= Memory.sources[source.id].miningSpots) continue;
            
            // Calculate a score based on available spots and distance
            // Higher score is better
            const availableSpots = Memory.sources[source.id].miningSpots - assignedHarvesters;
            const distance = creep.pos.getRangeTo(source);
            const score = availableSpots * 10 - distance; // Prioritize available spots over distance
        

            // If there's room for more harvesters at this source
            if (assignedHarvesters < Memory.sources[source.id].miningSpots) {
                creep.memory.sourceId = source.id;
                return;
            }
        }
        
        // If all sources are fully assigned, just pick the closest one
        const closestSource = creep.pos.findClosestByRange(sources);
        if (closestSource) {
            creep.memory.sourceId = closestSource.id;
        }
    },
    
    // Assign a specific mining position to the harvester
    assignMiningPosition: function(creep) {
        // Get the source memory
        if (!Memory.sources || !Memory.sources[creep.memory.sourceId]) return;
        
        const sourceMemory = Memory.sources[creep.memory.sourceId];
        
        // If this source doesn't have mining positions stored, skip
        if (!sourceMemory.miningPositions || sourceMemory.miningPositions.length === 0) return;
        
        // Find all positions that are not already taken by other harvesters
        const takenPositions = {};
        
        // Mark positions that are already assigned to other harvesters
        for (let name in Game.creeps) {
            const otherCreep = Game.creeps[name];
            if (otherCreep.id !== creep.id && 
                otherCreep.memory.role === 'harvester' && 
                otherCreep.memory.sourceId === creep.memory.sourceId && 
                otherCreep.memory.miningPos) {
                
                const pos = otherCreep.memory.miningPos;
                takenPositions[`${pos.x},${pos.y}`] = true;
            }
        }
        
        // Find an available position
        for (let pos of sourceMemory.miningPositions) {
            const posKey = `${pos.x},${pos.y}`;
            if (!takenPositions[posKey]) {
                // Assign this position to our harvester
                creep.memory.miningPos = pos;
                return;
            }
        }
    }
};

module.exports = roleHarvester;