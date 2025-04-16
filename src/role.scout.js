// Scout role
var roleScout = {
    run: function(creep) {
        // If we're in our target room
        if (creep.memory.targetRoom && creep.room.name === creep.memory.targetRoom) {
            // Survey all important aspects of this room
            this.surveyRoom(creep);
            
            // Move to next room if we've fully surveyed this one
            if (creep.memory.roomSurveyed) {
                this.findNextRoom(creep);
            }
        } else {
            // Move to target room
            if (creep.memory.targetRoom) {
                const exitDir = Game.map.findExit(creep.room, creep.memory.targetRoom);
                const exit = creep.pos.findClosestByPath(exitDir);
                creep.moveTo(exit, { visualizePathStyle: { stroke: '#ffaa00' } });
            } else {
                // Find a room to scout if we don't have one
                this.findNextRoom(creep);
            }
        }
    },
    
    surveyRoom: function(creep) {
        // Initialize room memory if needed
        if (!Memory.rooms) Memory.rooms = {};
        if (!Memory.rooms[creep.room.name]) Memory.rooms[creep.room.name] = {};
        
        // Record last visited time
        Memory.rooms[creep.room.name].lastSurvey = Game.time;
        
        // Survey sources (catalog them)
        this.surveySources(creep);
        
        // Survey for hostiles
        this.surveyHostiles(creep);
        
        // Survey controller status
        this.surveyController(creep);
        
        // Survey for structures
        this.surveyStructures(creep);
        
        // Mark room as surveyed if all aspects are completed
        if (Memory.rooms[creep.room.name].sourcesSurveyed &&
            Memory.rooms[creep.room.name].hostilesSurveyed &&
            Memory.rooms[creep.room.name].controllerSurveyed &&
            Memory.rooms[creep.room.name].structuresSurveyed) {
            creep.memory.roomSurveyed = true;
        }
    },
    
    surveySources: function(creep) {
        // Skip if already surveyed recently
        if (Memory.rooms[creep.room.name].sourcesSurveyed) return;
        
        // Find all sources in room
        const sources = creep.room.find(FIND_SOURCES);
        
        // Initialize sources memory if needed
        if (!Memory.rooms[creep.room.name].sources) Memory.rooms[creep.room.name].sources = {};
        
        // Add round trip calculation from spawn
        const homeSpawn = Game.spawns['Spawn1']; // Adjust for multiple spawns later
        
        // Survey each source
        let allSourcesSurveyed = true;
        sources.forEach(source => {
            // If we haven't surveyed this source yet
            if (!Memory.rooms[creep.room.name].sources[source.id]) {
                // Store source information
                Memory.rooms[creep.room.name].sources[source.id] = {
                    id: source.id,
                    pos: {
                        x: source.pos.x,
                        y: source.pos.y,
                        roomName: source.pos.roomName
                    }
                };
                
                // Calculate mining spots
                let area = source.room.lookAtArea(
                    Math.max(0, source.pos.y - 1),
                    Math.max(0, source.pos.x - 1),
                    Math.min(49, source.pos.y + 1),
                    Math.min(49, source.pos.x + 1),
                    true
                );
                
                // Calculate walkable positions
                const walkablePositions = [];
                area.forEach(pos => {
                    // Skip the source position itself
                    if (pos.x === source.pos.x && pos.y === source.pos.y) return;
                    
                    // Check terrain and structures as before...
                    // [Your existing filter code]
                    
                    // This is a valid mining position
                    if (!walkablePositions.some(p => p.x === pos.x && p.y === pos.y)) {
                        walkablePositions.push({x: pos.x, y: pos.y});
                    }
                });
                
                Memory.rooms[creep.room.name].sources[source.id].miningPositions = walkablePositions;
                Memory.rooms[creep.room.name].sources[source.id].miningSpots = walkablePositions.length;
                
                // Calculate round trip time if in a different room from spawn
                if (creep.room.name !== homeSpawn.room.name) {
                    const roundTripTime = this.calculateCrossRoomRoundTripTime(
                        creep.room.name,
                        source.pos,
                        homeSpawn.room.name,
                        homeSpawn.pos
                    );
                    Memory.rooms[creep.room.name].sources[source.id].roundTripTime = roundTripTime;
                } else {
                    // Local source calculation
                    const pathToSource = homeSpawn.pos.findPathTo(source.pos);
                    const timeToSource = pathToSource.length;
                    const timeFromSource = pathToSource.length * 2; // Hauler speed when full
                    Memory.rooms[creep.room.name].sources[source.id].roundTripTime = timeToSource + timeFromSource;
                }
                
                allSourcesSurveyed = false;
            }
        });
        
        // Mark sources as surveyed
        if (allSourcesSurveyed) {
            Memory.rooms[creep.room.name].sourcesSurveyed = true;
        }
    },
    
    surveyHostiles: function(creep) {
        // Skip if already surveyed recently
        if (Memory.rooms[creep.room.name].hostilesSurveyed) return;
        
        // Find hostile creeps
        const hostiles = creep.room.find(FIND_HOSTILE_CREEPS);
        
        // Store hostile info
        Memory.rooms[creep.room.name].hostiles = {
            count: hostiles.length,
            lastSeen: hostiles.length > 0 ? Game.time : Memory.rooms[creep.room.name].hostiles?.lastSeen || 0,
            dangerLevel: this.assessDangerLevel(hostiles)
        };
        
        // Mark hostiles as surveyed
        Memory.rooms[creep.room.name].hostilesSurveyed = true;
    },
    
    assessDangerLevel: function(hostiles) {
        // Basic danger assessment based on number and strength of hostiles
        let dangerLevel = 0;
        
        if (hostiles.length === 0) return dangerLevel;
        
        // Count attack/ranged parts
        let attackParts = 0;
        hostiles.forEach(hostile => {
            for (let part of hostile.body) {
                if (part.type === ATTACK || part.type === RANGED_ATTACK) {
                    attackParts++;
                }
            }
        });
        
        // Assess danger
        if (attackParts > 10) dangerLevel = 3; // Extreme danger
        else if (attackParts > 3) dangerLevel = 2; // Significant danger
        else if (attackParts > 0) dangerLevel = 1; // Mild danger
        
        return dangerLevel;
    },
    
    surveyController: function(creep) {
        // Skip if already surveyed
        if (Memory.rooms[creep.room.name].controllerSurveyed) return;
        
        const controller = creep.room.controller;
        
        if (controller) {
            Memory.rooms[creep.room.name].controller = {
                exists: true,
                id: controller.id,
                level: controller.level,
                owner: controller.owner ? controller.owner.username : null,
                reservation: controller.reservation ? {
                    username: controller.reservation.username,
                    ticksToEnd: controller.reservation.ticksToEnd
                } : null
            };
        } else {
            Memory.rooms[creep.room.name].controller = { exists: false };
        }
        
        // Mark controller as surveyed
        Memory.rooms[creep.room.name].controllerSurveyed = true;
    },
    
    surveyStructures: function(creep) {
        // Skip if already surveyed
        if (Memory.rooms[creep.room.name].structuresSurveyed) return;
        
        const structures = creep.room.find(FIND_STRUCTURES);
        
        // Count structure types
        const structureCounts = {};
        structures.forEach(s => {
            if (!structureCounts[s.structureType]) structureCounts[s.structureType] = 0;
            structureCounts[s.structureType]++;
        });
        
        Memory.rooms[creep.room.name].structures = {
            counts: structureCounts,
            totalCount: structures.length
        };
        
        // Mark structures as surveyed
        Memory.rooms[creep.room.name].structuresSurveyed = true;
    },
    
    calculateCrossRoomRoundTripTime: function(sourceRoom, sourcePos, spawnRoom, spawnPos) {
        // Use Game.map.findRoute to get route between rooms
        const route = Game.map.findRoute(sourceRoom, spawnRoom);
        
        if (route === ERR_NO_PATH) {
            return Infinity; // No path available
        }
        
        // Estimate distance within rooms (simplified)
        let totalDistance = 0;
        
        // Distance from source to exit in source room
        const sourceExitDir = route[0].exit;
        let sourceExitPos;
        
        switch(sourceExitDir) {
            case FIND_EXIT_TOP: sourceExitPos = new RoomPosition(25, 0, sourceRoom); break;
            case FIND_EXIT_RIGHT: sourceExitPos = new RoomPosition(49, 25, sourceRoom); break;
            case FIND_EXIT_BOTTOM: sourceExitPos = new RoomPosition(25, 49, sourceRoom); break;
            case FIND_EXIT_LEFT: sourceExitPos = new RoomPosition(0, 25, sourceRoom); break;
        }
        
        // Add distance from source to exit
        totalDistance += Math.abs(sourcePos.x - sourceExitPos.x) + Math.abs(sourcePos.y - sourceExitPos.y);
        
        // Add 50 for each room transition (approximate cost to cross a room)
        totalDistance += route.length * 50;
        
        // Add distance from entrance to spawn in spawn room
        const spawnEntranceDir = route[route.length - 1].exit;
        let spawnEntrancePos;
        
        // Entrance is the opposite direction of the exit
        switch(spawnEntranceDir) {
            case FIND_EXIT_TOP: spawnEntrancePos = new RoomPosition(25, 49, spawnRoom); break;
            case FIND_EXIT_RIGHT: spawnEntrancePos = new RoomPosition(0, 25, spawnRoom); break;
            case FIND_EXIT_BOTTOM: spawnEntrancePos = new RoomPosition(25, 0, spawnRoom); break;
            case FIND_EXIT_LEFT: spawnEntrancePos = new RoomPosition(49, 25, spawnRoom); break;
        }
        
        totalDistance += Math.abs(spawnEntrancePos.x - spawnPos.x) + Math.abs(spawnEntrancePos.y - spawnPos.y);
        
        // Calculate times based on hauler build [MOVE,MOVE,MOVE,CARRY,CARRY,CARRY]
        const timeToSource = totalDistance; // Empty hauler
        const timeFromSource = totalDistance * 2; // Full hauler
        return timeToSource + timeFromSource;
    },
    
    findNextRoom: function(creep) {
        // Find exits to adjacent rooms
        const exits = Game.map.describeExits(creep.room.name);
        
        // Find an unvisited room or one that needs resurveying
        const MAX_SURVEY_AGE = 10000; // Resurvey rooms after this many ticks
        
        for (let dir in exits) {
            const roomName = exits[dir];
            
            // Skip rooms we've recently surveyed
            if (Memory.rooms && 
                Memory.rooms[roomName] && 
                Memory.rooms[roomName].lastSurvey && 
                Game.time - Memory.rooms[roomName].lastSurvey < MAX_SURVEY_AGE) {
                continue;
            }
            
            // Set this as our next target
            creep.memory.targetRoom = roomName;
            creep.memory.roomSurveyed = false;
            return;
        }
        
        // If all adjacent rooms are recently surveyed, return to home
        creep.memory.targetRoom = creep.memory.homeRoom;
    }
};

module.exports = roleScout;