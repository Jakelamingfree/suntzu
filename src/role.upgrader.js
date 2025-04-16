var roleUpgrader = {
    /** @param {Creep} creep **/
    run: function(creep) {
        // State switching logic
        if (creep.memory.working && creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.working = false;
            creep.say('🔄 harvest');
        }
        if (!creep.memory.working && creep.store.getFreeCapacity() === 0) {
            creep.memory.working = true;
            creep.say('⚡ work');
        }

        // Working state - upgrade, repair, or build
        if (creep.memory.working) {
            // Determine the creep's priority based on count
            if (!Memory.priorityUpgraders) {
                Memory.priorityUpgraders = {};
            }
            
            // Check if this creep is already designated as a priority upgrader
            if (Memory.priorityUpgraders[creep.name] === undefined) {
                // Count existing priority upgraders
                const priorityUpgraderCount = Object.keys(Memory.priorityUpgraders).length;
                
                // First 4 upgraders focus on controller, others on repair/construction
                Memory.priorityUpgraders[creep.name] = priorityUpgraderCount < 4;
                
                // Clean up memory of non-existent creeps
                for (const name in Memory.priorityUpgraders) {
                    if (!Game.creeps[name]) {
                        delete Memory.priorityUpgraders[name];
                    }
                }
            }
            
            // If this is a priority upgrader, focus on the controller
            if (Memory.priorityUpgraders[creep.name]) {
                if (creep.upgradeController(creep.room.controller) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(creep.room.controller, { visualizePathStyle: { stroke: '#ffffff' } });
                }
            } else {
                // For non-priority upgraders, check for repair needs first
                const structures = creep.room.find(FIND_STRUCTURES, {
                    filter: structure => structure.hits < structure.hitsMax &&
                                        structure.structureType !== STRUCTURE_WALL
                });
                
                // Sort by damage percentage to prioritize most damaged structures
                structures.sort((a, b) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax));
                
                if (structures.length > 0) {
                    // Repair the most damaged structure
                    if (creep.repair(structures[0]) == ERR_NOT_IN_RANGE) {
                        creep.moveTo(structures[0], { visualizePathStyle: { stroke: '#ffaa00' } });
                    }
                } else {
                    // No repairs needed, look for construction sites
                    const constructionSites = creep.room.find(FIND_CONSTRUCTION_SITES);
                    
                    if (constructionSites.length > 0) {
                        // Build the first construction site
                        if (creep.build(constructionSites[0]) == ERR_NOT_IN_RANGE) {
                            creep.moveTo(constructionSites[0], { visualizePathStyle: { stroke: '#ffffff' } });
                        }
                    } else {
                        // No construction sites, fall back to upgrading controller
                        if (creep.upgradeController(creep.room.controller) == ERR_NOT_IN_RANGE) {
                            creep.moveTo(creep.room.controller, { visualizePathStyle: { stroke: '#ffffff' } });
                        }
                    }
                }
            }
        }
        // Not working state - gather energy
        else {
            // First check for dropped energy
            const droppedEnergy = creep.pos.findClosestByRange(FIND_DROPPED_RESOURCES, {
                filter: resource => resource.resourceType == RESOURCE_ENERGY
            });
            
            if (droppedEnergy) {
                if (creep.pickup(droppedEnergy) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(droppedEnergy, { visualizePathStyle: { stroke: '#ffaa00' } });
                }
            } else {
                // If no dropped energy, find the closest source
                const source = creep.pos.findClosestByRange(FIND_SOURCES_ACTIVE);
                if (creep.harvest(source) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(source, { visualizePathStyle: { stroke: '#ffaa00' } });
                }
            }
        }
    }
};

module.exports = roleUpgrader;