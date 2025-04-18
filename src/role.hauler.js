var roleHauler = {
    /** @param {Creep} creep **/
    run: function(creep) {
        // Modified collection behavior: Start delivering once we're at least 30% full
        const MIN_FILL_RATIO = 0.3; // 30% full is enough to start delivering
        const shouldDeliver = creep.store.getUsedCapacity() >= creep.store.getCapacity() * MIN_FILL_RATIO;
        
        // If we have enough energy, go deliver it
        if (shouldDeliver) {
            // Prioritize energy delivery to structures that need it
            const targets = creep.room.find(FIND_STRUCTURES, {
                filter: structure => {
                    // Priority order: Spawns, Extensions, Towers
                    return (
                        // Spawns that need energy
                        (structure.structureType == STRUCTURE_SPAWN && 
                         structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0) ||
                        // Extensions that need energy
                        (structure.structureType == STRUCTURE_EXTENSION && 
                         structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0) ||
                        // Towers below 80% energy
                        (structure.structureType == STRUCTURE_TOWER && 
                         structure.store.getFreeCapacity(RESOURCE_ENERGY) > 200) ||
                        // Storage as a last resort
                        (structure.structureType == STRUCTURE_STORAGE && 
                         structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0)
                    );
                }
            });
            
            // Sort targets by priority (spawns first, then extensions, then towers)
            targets.sort((a, b) => {
                const priority = {
                    [STRUCTURE_SPAWN]: 1,
                    [STRUCTURE_EXTENSION]: 2,
                    [STRUCTURE_TOWER]: 3, 
                    [STRUCTURE_STORAGE]: 4
                };
                return priority[a.structureType] - priority[b.structureType];
            });
            
            if (targets.length > 0) {
                // Try to transfer to the highest priority target
                if (creep.transfer(targets[0], RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(targets[0], { visualizePathStyle: { stroke: '#ffaa00' } });
                }
            } else {
                // If nowhere to deliver energy, wait near spawn/sources
                this.waitStrategically(creep);
            }
        } else {
            // We need to collect more energy
            this.collectEnergy(creep);
        }
    },
    
    collectEnergy: function(creep) {
        // Find all dropped energy in the room
        const droppedEnergy = creep.room.find(FIND_DROPPED_RESOURCES, {
            filter: resource => resource.resourceType == RESOURCE_ENERGY
        });
        
        // Find all containers with energy
        const containers = creep.room.find(FIND_STRUCTURES, {
            filter: structure => structure.structureType == STRUCTURE_CONTAINER && 
                               structure.store[RESOURCE_ENERGY] > 0
        });
        
        // If no energy sources found, wait strategically
        if (droppedEnergy.length === 0 && containers.length === 0) {
            this.waitStrategically(creep);
            return;
        }
        
        // Score each energy source based on amount and distance
        const energySources = [];
        
        // Score dropped energy
        droppedEnergy.forEach(resource => {
            const distance = creep.pos.getRangeTo(resource);
            // Calculate how much we can pick up (min of resource amount or our capacity)
            const amount = Math.min(resource.amount, creep.store.getFreeCapacity());
            
            // Calculate a score based on amount and distance
            // Higher amount = better, higher distance = worse
            // Use amount/distance for efficiency (modified by a factor to prefer larger piles)
            const score = (amount * amount) / (distance * 10);
            
            energySources.push({
                target: resource,
                score: score,
                type: 'dropped'
            });
        });
        
        // Score containers
        containers.forEach(container => {
            const distance = creep.pos.getRangeTo(container);
            // Calculate how much we can withdraw (min of container energy or our capacity)
            const amount = Math.min(container.store[RESOURCE_ENERGY], creep.store.getFreeCapacity());
            
            // Calculate score similar to dropped energy, but with slight preference for containers
            const score = (amount * amount) / (distance * 10) * 1.1; // 10% bonus for containers
            
            energySources.push({
                target: container,
                score: score,
                type: 'container'
            });
        });
        
        // Sort energy sources by score (highest first)
        energySources.sort((a, b) => b.score - a.score);
        
        // If we found at least one energy source
        if (energySources.length > 0) {
            const bestSource = energySources[0];
            
            if (bestSource.type === 'dropped') {
                // Try to pickup the dropped energy
                if (creep.pickup(bestSource.target) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(bestSource.target, { visualizePathStyle: { stroke: '#ffaa00' } });
                    creep.say('🔄 get');
                }
            } else if (bestSource.type === 'container') {
                // Try to withdraw from the container
                if (creep.withdraw(bestSource.target, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(bestSource.target, { visualizePathStyle: { stroke: '#ffaa00' } });
                    creep.say('📦 cont');
                }
            }
        } else {
            // If no energy sources found, wait strategically
            this.waitStrategically(creep);
        }
    },
    
    waitStrategically: function(creep) {
        // Find a strategic location to wait - preferring positions near sources
        const sources = creep.room.find(FIND_SOURCES);
        
        if (sources.length > 0) {
            // Find which source is likely to have the most energy dropped around it
            // Simple heuristic: check which source has the most harvesters nearby
            let bestSourceScore = -1;
            let bestSource = null;
            
            sources.forEach(source => {
                // Count harvesters within 3 tiles of this source
                const nearbyHarvesters = source.pos.findInRange(FIND_MY_CREEPS, 3, {
                    filter: c => c.memory.role === 'harvester'
                }).length;
                
                // Calculate a score: prioritize sources with harvesters but without many haulers
                const nearbyHaulers = source.pos.findInRange(FIND_MY_CREEPS, 3, {
                    filter: c => c.memory.role === 'hauler' && c.id !== creep.id
                }).length;
                
                // More harvesters and fewer haulers = better
                const sourceScore = nearbyHarvesters * 2 - nearbyHaulers;
                
                if (sourceScore > bestSourceScore) {
                    bestSourceScore = sourceScore;
                    bestSource = source;
                }
            });
            
            // If we found a good source to wait near
            if (bestSource && bestSourceScore > 0) {
                // Find a position 2 tiles away from the source
                // This keeps us close but not interfering with harvesters
                const dx = creep.pos.x - bestSource.pos.x;
                const dy = creep.pos.y - bestSource.pos.y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                
                // If we're already at a good distance, stay put
                if (dist >= 2 && dist <= 3) {
                    return;
                }
                
                // Otherwise move to a good waiting position
                const targetPos = new RoomPosition(
                    bestSource.pos.x + (dx !== 0 ? Math.sign(dx) * 2 : 0),
                    bestSource.pos.y + (dy !== 0 ? Math.sign(dy) * 2 : 0),
                    bestSource.pos.roomName
                );
                
                creep.moveTo(targetPos, { visualizePathStyle: { stroke: '#ffaa00' } });
                creep.say('⏳ wait');
                return;
            }
        }
        
        // Fallback: wait near spawn if no good source found
        const spawn = creep.room.find(FIND_MY_SPAWNS)[0];
        if (spawn) {
            // Wait near spawn, but not right on top of it
            const waitPos = new RoomPosition(
                spawn.pos.x + 3, 
                spawn.pos.y + 3, 
                spawn.pos.roomName
            );
            creep.moveTo(waitPos, { visualizePathStyle: { stroke: '#ffaa00' } });
        }
    }
};

module.exports = roleHauler;