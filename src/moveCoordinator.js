/**
 * Enhanced Movement Coordination Module
 * - Better path caching
 * - Improved traffic management
 * - Support for multi-room travel
 */

var moveCoordinator = {
    /**
     * Initialize the movement coordinator
     * Call this at the beginning of each tick
     */
    init: function() {
        if(!Memory.moveCoordinator) {
            Memory.moveCoordinator = {
                positions: {},       // Current positions
                intentions: {},      // Where creeps want to move
                pathCache: {},       // Cache for common paths
                roomData: {}         // Data about rooms (safe, dangerous, etc.)
            };
        } else {
            // Clear the previous tick's position and intention data
            Memory.moveCoordinator.positions = {};
            Memory.moveCoordinator.intentions = {};
            
            // Clear old path cache entries
            this.cleanPathCache();
        }
        
        // Register all creep positions
        for(const name in Game.creeps) {
            const creep = Game.creeps[name];
            const posKey = this.positionToKey(creep.pos);
            Memory.moveCoordinator.positions[posKey] = name;
        }
    },
    
    /**
     * Clean expired entries from path cache
     */
    cleanPathCache: function() {
        const cache = Memory.moveCoordinator.pathCache;
        const now = Game.time;
        
        for(const key in cache) {
            if(cache[key].expiration < now) {
                delete cache[key];
            }
        }
    },
    
    /**
     * Convert a position to a unique string key
     */
    positionToKey: function(pos) {
        return `${pos.roomName}_${pos.x}_${pos.y}`;
    },
    
    /**
     * Create a cache key for a path from one position to another
     */
    createPathKey: function(start, end) {
        return `${start.roomName}_${start.x}_${start.y}_to_${end.roomName}_${end.x}_${end.y}`;
    },
    
    /**
     * Improved moveTo that avoids traffic jams and supports multi-room travel
     * @param {Creep} creep - The creep to move
     * @param {RoomPosition|{pos: RoomPosition}} target - The target to move to
     * @param {Object} opts - Options for moveTo
     * @returns {number} Result code
     */
    moveTo: function(creep, target, opts = {}) {
        // Extract target position
        const targetPos = target.pos ? target.pos : target;
        
        // If already at target, no need to move
        if(creep.pos.isEqualTo(targetPos)) {
            return OK;
        }
        
        // If next to target, also don't need complex logic
        if(creep.pos.isNearTo(targetPos)) {
            return creep.moveTo(target, opts);
        }
        
        // Default options
        const defaultOpts = {
            reusePath: 20,              // Reuse path for more ticks to save CPU
            visualizePathStyle: {stroke: '#ffffff'},
            ignoreCreeps: false,         // Important: don't ignore creeps for initial pathing
            plainCost: 2,
            swampCost: 10,              // Prefer roads over swamps
            maxRooms: 16,               // Allow multi-room pathing
            range: opts.range || 1       // Default range to 1
        };
        
        // Merge with provided options
        const options = Object.assign({}, defaultOpts, opts);
        
        // Check if we're crossing rooms
        const crossingRooms = targetPos.roomName !== creep.pos.roomName;
        
        // If crossing rooms, check if we have scouted the target room
        if(crossingRooms) {
            if(!Memory.moveCoordinator.roomData[targetPos.roomName]) {
                // Mark this room as needing scouting
                this.markRoomForScouting(targetPos.roomName);
            }
            
            // Adjust options for multi-room travel
            options.reusePath = 50; // Longer path reuse for cross-room travel
        }
        
        // Try to use cached path if available
        const pathKey = this.createPathKey(creep.pos, targetPos);
        const cachedPath = Memory.moveCoordinator.pathCache[pathKey];
        
        if(cachedPath && cachedPath.expiration > Game.time) {
            // Use cached path
            creep.memory._move = cachedPath.moveData;
        }
        
        // Get the previous path from memory
        const prevPath = creep.memory._move ? creep.memory._move.path : null;
        const prevTarget = creep.memory._move ? creep.memory._move.dest : null;
        
        // Check if we already have a valid path to the same destination
        if(prevPath && prevTarget && 
           prevTarget.roomName === targetPos.roomName &&
           prevTarget.x === targetPos.x && 
           prevTarget.y === targetPos.y) {
            
            // Get next position in path
            const pathPos = this.getNextPathPosition(creep, prevPath);
            if(pathPos) {
                const posKey = this.positionToKey(pathPos);
                
                // Register our intention to move to this position
                Memory.moveCoordinator.intentions[posKey] = creep.name;
                
                // Check if the next position is occupied or contested
                if(Memory.moveCoordinator.positions[posKey]) {
                    const blockingCreepName = Memory.moveCoordinator.positions[posKey];
                    const blockingCreep = Game.creeps[blockingCreepName];
                    
                    if(blockingCreep) {
                        // Check if the blocking creep is trying to move to our position (swap)
                        const blockingCreepIntention = this.getNextIntendedPosition(blockingCreep);
                        if(blockingCreepIntention && blockingCreepIntention.isEqualTo(creep.pos)) {
                            // The creeps are trying to swap! Allow it
                            return creep.move(creep.pos.getDirectionTo(pathPos));
                        }
                        
                        // Check if multiple creeps are trying to move to the same position
                        if(Memory.moveCoordinator.intentions[posKey] && 
                           Memory.moveCoordinator.intentions[posKey] !== creep.name) {
                            // Conflict detected - who has priority?
                            if(this.shouldHavePriority(creep, Game.creeps[Memory.moveCoordinator.intentions[posKey]])) {
                                // We have priority, continue with move
                            } else {
                                // We don't have priority - find alternative path
                                delete creep.memory._move;
                                options.ignoreCreeps = true;
                                options.avoidPos = [pathPos]; // Avoid the contested position
                            }
                        }
                        
                        // Check if the blocking creep has been there for multiple ticks
                        if(blockingCreep.memory.stuckAt === posKey) {
                            blockingCreep.memory.stuckTicks = (blockingCreep.memory.stuckTicks || 0) + 1;
                            
                            // If stuck for too long, try to find an alternative path
                            if(blockingCreep.memory.stuckTicks > 3) {
                                // Reset path to force recalculation with ignoreCreeps
                                delete creep.memory._move;
                                options.ignoreCreeps = true;
                            }
                        } else {
                            blockingCreep.memory.stuckAt = posKey;
                            blockingCreep.memory.stuckTicks = 1;
                        }
                    }
                }
            }
        }
        
        // Move the creep
        const result = creep.moveTo(target, options);
        
        // If successful movement and crossing rooms, cache the path
        if(result === OK && (crossingRooms || options.reusePath > 15)) {
            // Cache the path for future use
            Memory.moveCoordinator.pathCache[pathKey] = {
                moveData: creep.memory._move,
                expiration: Game.time + options.reusePath * 2
            };
        }
        
        // If we're stuck, try to step aside for other creeps
        if(result !== OK && result !== ERR_TIRED) {
            creep.memory.stuck = (creep.memory.stuck || 0) + 1;
            
            // After being stuck for a few ticks, try to move randomly
            if(creep.memory.stuck > 5) {
                const result = this.moveRandomly(creep);
                if(result === OK) {
                    creep.memory.stuck = 0;
                }
            }
        } else {
            // Reset stuck counter when we can move
            creep.memory.stuck = 0;
        }
        
        return result;
    },
    
    /**
     * Move creep in a random valid direction
     */
    moveRandomly: function(creep) {
        const directions = [TOP, TOP_RIGHT, RIGHT, BOTTOM_RIGHT, BOTTOM, BOTTOM_LEFT, LEFT, TOP_LEFT];
        // Shuffle directions
        directions.sort(() => 0.5 - Math.random());
        
        // Try each direction until we find one that works
        for(let i = 0; i < directions.length; i++) {
            const direction = directions[i];
            // Define the deltas ourselves
            const directionDeltas = {
                [TOP]: [0, -1],
                [TOP_RIGHT]: [1, -1],
                [RIGHT]: [1, 0],
                [BOTTOM_RIGHT]: [1, 1],
                [BOTTOM]: [0, 1],
                [BOTTOM_LEFT]: [-1, 1],
                [LEFT]: [-1, 0],
                [TOP_LEFT]: [-1, -1]
            };
            
            const delta = directionDeltas[direction] || [0, 0];
            const newPos = new RoomPosition(
                creep.pos.x + delta[0],
                creep.pos.y + delta[1],
                creep.pos.roomName
            );
            
            // Skip if out of bounds
            if(newPos.x < 0 || newPos.y < 0 || newPos.x > 49 || newPos.y > 49) continue;
            
            // Check if position is walkable and not occupied
            const posKey = this.positionToKey(newPos);
            const terrain = Game.map.getRoomTerrain(newPos.roomName);
            
            if(terrain.get(newPos.x, newPos.y) !== TERRAIN_MASK_WALL && 
              !Memory.moveCoordinator.positions[posKey] &&
              !Memory.moveCoordinator.intentions[posKey]) {
                return creep.move(direction);
            }
        }
        
        return ERR_NO_PATH;
    },
    
    /**
     * Determine if one creep should have movement priority over another
     */
    shouldHavePriority: function(creepA, creepB) {
        // Priority order: haulers with energy > harvesters > builders/upgraders > empty haulers
        
        // Haulers carrying energy have highest priority
        if(creepA.memory.role === 'hauler' && creepA.store[RESOURCE_ENERGY] > 0 &&
           !(creepB.memory.role === 'hauler' && creepB.store[RESOURCE_ENERGY] > 0)) {
            return true;
        }
        
        if(creepB.memory.role === 'hauler' && creepB.store[RESOURCE_ENERGY] > 0 &&
           !(creepA.memory.role === 'hauler' && creepA.store[RESOURCE_ENERGY] > 0)) {
            return false;
        }
        
        // Harvesters come next
        if(creepA.memory.role === 'harvester' && creepB.memory.role !== 'harvester') {
            return true;
        }
        
        if(creepB.memory.role === 'harvester' && creepA.memory.role !== 'harvester') {
            return false;
        }
        
        // If same role, give priority to the one carrying more energy
        if(creepA.memory.role === creepB.memory.role) {
            return creepA.store[RESOURCE_ENERGY] > creepB.store[RESOURCE_ENERGY];
        }
        
        // Default: give priority to the creep with higher body count (more expensive)
        return creepA.body.length > creepB.body.length;
    },
    
    /**
     * Get the next position in a creep's path
     */
    getNextPathPosition: function(creep, serializedPath) {
        if(!serializedPath || serializedPath.length === 0) return null;
        
        // PathFinder returns path as a serialized string of encoded directions
        const nextDirection = parseInt(serializedPath[0]);
        if(isNaN(nextDirection)) return null;
        
        // Calculate new position based on direction
        let newX = creep.pos.x;
        let newY = creep.pos.y;
        
        // See https://docs.screeps.com/api/#Room-serializePath
        if(nextDirection === TOP || nextDirection === TOP_RIGHT || nextDirection === TOP_LEFT) {
            newY--;
        } else if(nextDirection === BOTTOM || nextDirection === BOTTOM_RIGHT || nextDirection === BOTTOM_LEFT) {
            newY++;
        }
        
        if(nextDirection === RIGHT || nextDirection === TOP_RIGHT || nextDirection === BOTTOM_RIGHT) {
            newX++;
        } else if(nextDirection === LEFT || nextDirection === TOP_LEFT || nextDirection === BOTTOM_LEFT) {
            newX--;
        }
        
        // Return new position
        return new RoomPosition(newX, newY, creep.pos.roomName);
    },
    
    /**
     * Get the next intended position for a creep based on its _move memory
     */
    getNextIntendedPosition: function(creep) {
        if(!creep.memory._move || !creep.memory._move.path) return null;
        
        return this.getNextPathPosition(creep, creep.memory._move.path);
    },
    
    /**
     * Mark a room as needing scouting 
     */
    markRoomForScouting: function(roomName) {
        if(!Memory.roomsToScout) {
            Memory.roomsToScout = [];
        }
        
        if(!Memory.roomsToScout.includes(roomName)) {
            Memory.roomsToScout.push(roomName);
        }
    },
    
    /**
     * Determine if a room is safe to enter
     */
    isRoomSafe: function(roomName) {
        const roomData = Memory.moveCoordinator.roomData[roomName];
        
        // If we've never scouted this room, consider it unknown (not safe)
        if(!roomData) {
            return false;
        }
        
        // Check if room was marked as unsafe or has hostile creeps
        return !roomData.unsafe;
    },
    
    /**
     * Update room data based on scouting information
     */
    updateRoomData: function(roomName, data) {
        if(!Memory.moveCoordinator.roomData[roomName]) {
            Memory.moveCoordinator.roomData[roomName] = {};
        }
        
        // Update with new data
        Object.assign(Memory.moveCoordinator.roomData[roomName], data);
    }
};

module.exports = moveCoordinator;