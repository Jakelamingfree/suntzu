/**
 * Scout Role
 * - Explores adjacent rooms
 * - Identifies sources and resource opportunities
 * - Gathers intel on room safety and layout
 * - Marks potential remote harvesting rooms
 */

var moveCoordinator = require('moveCoordinator');

var roleScout = {
    /** @param {Creep} creep **/
    run: function(creep) {
        // Initialize scout memory
        if(!creep.memory.homeRoom) {
            creep.memory.homeRoom = creep.room.name;
        }
        
        // If we just entered a new room, collect data about it
        if(creep.memory.lastRoom !== creep.room.name) {
            this.collectRoomData(creep);
            creep.memory.lastRoom = creep.room.name;
        }
        
        // Check if we have a target room
        if(creep.memory.targetRoom) {
            // If we're in the target room already, scout it
            if(creep.room.name === creep.memory.targetRoom) {
                this.scoutRoom(creep);
            } else {
                // Travel to target room
                this.travelToRoom(creep, creep.memory.targetRoom);
            }
        } else {
            // No target room, pick the next one to scout
            this.selectNextRoom(creep);
        }
    },
    
    /**
     * Collect data about the current room
     */
    collectRoomData: function(creep) {
        const room = creep.room;
        
        // Skip if this is a reserved or owned room (already have vision)
        if(room.controller && (room.controller.my || 
                             (room.controller.reservation && room.controller.reservation.username === creep.owner.username))) {
            return;
        }
        
        // Update room data in memory
        if(!Memory.roomData) Memory.roomData = {};
        if(!Memory.roomData[room.name]) Memory.roomData[room.name] = {};
        
        const roomData = Memory.roomData[room.name];
        
        // Check for hostile creeps or structures
        const hostiles = room.find(FIND_HOSTILE_CREEPS);
        const hostileStructures = room.find(FIND_HOSTILE_STRUCTURES);
        
        roomData.lastScouted = Game.time;
        roomData.hostiles = hostiles.length;
        roomData.hostileStructures = hostileStructures.length;
        roomData.owner = room.controller && room.controller.owner ? room.controller.owner.username : null;
        roomData.reservation = room.controller && room.controller.reservation ? room.controller.reservation.username : null;
        
        // Consider the room unsafe if there are hostiles or it's owned/reserved by others
        roomData.safe = hostiles.length === 0 && 
                      hostileStructures.length === 0 &&
                      !(roomData.owner && roomData.owner !== creep.owner.username) &&
                      !(roomData.reservation && roomData.reservation !== creep.owner.username);
        
        // Find sources and their positions
        const sources = room.find(FIND_SOURCES);
        roomData.sources = sources.map(source => ({
            id: source.id,
            x: source.pos.x,
            y: source.pos.y
        }));
        
        // Check for minerals
        const minerals = room.find(FIND_MINERALS);
        roomData.minerals = minerals.map(mineral => ({
            id: mineral.id,
            mineralType: mineral.mineralType,
            x: mineral.pos.x,
            y: mineral.pos.y
        }));
        
        // Analyze room for remote harvesting potential
        this.analyzeHarvestingPotential(creep, room, roomData);
        
        // Update movement coordinator with this room's data
        moveCoordinator.updateRoomData(room.name, {
            unsafe: !roomData.safe,
            lastChecked: Game.time
        });
        
        // Let's also mark all exits of this room for future scouting
        this.markExitsForScouting(room);
        
        creep.say('📝 Scouting');
        console.log(`Scout ${creep.name} collected data about room ${room.name}: ${roomData.sources.length} sources, safe: ${roomData.safe}`);
    },
    
    /**
     * Mark all exits of the current room for future scouting
     */
    markExitsForScouting: function(room) {
        const exits = Game.map.describeExits(room.name);
        
        for(const direction in exits) {
            const roomName = exits[direction];
            
            // Skip if we already have fresh data about this room
            if(Memory.roomData && Memory.roomData[roomName] && 
               Memory.roomData[roomName].lastScouted > Game.time - 10000) {
                continue;
            }
            
            // Mark for scouting
            moveCoordinator.markRoomForScouting(roomName);
        }
    },
    
    /**
     * Analyze a room's potential for remote harvesting
     */
    analyzeHarvestingPotential: function(creep, room, roomData) {
        // Only consider rooms that:
        // 1. Are safe (no hostiles)
        // 2. Have sources
        // 3. Are within a reasonable distance of our home room (not too far)
        // 4. Are not owned or reserved by others
        
        if(!roomData.safe || roomData.sources.length === 0 || 
           roomData.owner || roomData.reservation) {
            roomData.harvestPotential = 'none';
            return;
        }
        
        // Check the linear distance between this room and home
        const distance = Game.map.getRoomLinearDistance(room.name, creep.memory.homeRoom);
        
        if(distance > 2) {
            // Too far for efficient remote harvesting
            roomData.harvestPotential = 'too_far';
            return;
        }
        
        // Check if there's a reasonable path between rooms
        const route = Game.map.findRoute(room.name, creep.memory.homeRoom);
        if(route === ERR_NO_PATH || route.length > 3) {
            roomData.harvestPotential = 'bad_path';
            return;
        }
        
        // This room has potential for remote harvesting
        roomData.harvestPotential = 'good';
        
        // Add to the list of remote harvesting rooms if not already there
        if(!Memory.remoteHarvestRooms) Memory.remoteHarvestRooms = [];
        if(!Memory.remoteHarvestRooms.includes(room.name)) {
            Memory.remoteHarvestRooms.push(room.name);
            console.log(`Scout ${creep.name} identified room ${room.name} as a potential remote harvesting room`);
        }
    },
    
    /**
     * Scout around a room to gather data
     */
    scoutRoom: function(creep) {
        // Move around the room to gain vision of all important areas
        
        // First, check if we've visited the controller
        if(creep.room.controller && !creep.memory.visitedController) {
            moveCoordinator.moveTo(creep, creep.room.controller, {
                visualizePathStyle: {stroke: '#ffffff'},
                reusePath: 10
            });
            
            // If we're close to the controller, mark it as visited
            if(creep.pos.inRangeTo(creep.room.controller, 3)) {
                creep.memory.visitedController = true;
            }
            
            return;
        }
        
        // Next, try to visit all sources
        const sources = creep.room.find(FIND_SOURCES);
        for(const source of sources) {
            if(!creep.memory.visitedSources) creep.memory.visitedSources = {};
            
            if(!creep.memory.visitedSources[source.id]) {
                moveCoordinator.moveTo(creep, source, {
                    visualizePathStyle: {stroke: '#ffffff'},
                    reusePath: 10
                });
                
                // If we're close to the source, mark it as visited
                if(creep.pos.inRangeTo(source, 3)) {
                    creep.memory.visitedSources[source.id] = true;
                }
                
                return;
            }
        }
        
        // Check if we've visited all important areas
        if(creep.memory.visitedController && 
           sources.every(s => creep.memory.visitedSources && creep.memory.visitedSources[s.id])) {
            
            // Room fully scouted, clear target to get a new one
            delete creep.memory.targetRoom;
            delete creep.memory.visitedController;
            delete creep.memory.visitedSources;
            
            creep.say('✓ Scouted');
        } else {
            // If we're here, there might be sources we haven't discovered yet
            // Move to center of room to gain more vision
            moveCoordinator.moveTo(creep, new RoomPosition(25, 25, creep.room.name), {
                visualizePathStyle: {stroke: '#ffffff'}
            });
        }
    },
    
    /**
     * Select the next room to scout
     */
    selectNextRoom: function(creep) {
        // Check if we need to return to home room periodically
        const ticksSinceHome = Game.time - (creep.memory.lastHomeVisit || 0);
        if(ticksSinceHome > 300 && creep.room.name !== creep.memory.homeRoom) {
            creep.memory.targetRoom = creep.memory.homeRoom;
            creep.say('🏠 Home');
            return;
        }
        
        // If we're in home room, mark the visit time
        if(creep.room.name === creep.memory.homeRoom) {
            creep.memory.lastHomeVisit = Game.time;
        }
        
        // Priority:
        // 1. Rooms in the scout queue
        // 2. Unexplored adjacent rooms
        // 3. Rooms that were scouted long ago
        
        // Check the global scout queue
        if(Memory.roomsToScout && Memory.roomsToScout.length > 0) {
            // Get the first room in queue
            const nextRoom = Memory.roomsToScout.shift();
            
            // Skip if we already have fresh data about this room
            if(Memory.roomData && Memory.roomData[nextRoom] && 
               Memory.roomData[nextRoom].lastScouted > Game.time - 5000) {
                // Skip this room and try again
                return this.selectNextRoom(creep);
            }
            
            creep.memory.targetRoom = nextRoom;
            creep.say('🔍 Scouting');
            return;
        }
        
        // If no rooms in queue, check adjacent unexplored rooms
        const exits = Game.map.describeExits(creep.room.name);
        const unexploredRooms = [];
        
        for(const direction in exits) {
            const roomName = exits[direction];
            
            // Skip if we already have data about this room
            if(Memory.roomData && Memory.roomData[roomName]) {
                continue;
            }
            
            unexploredRooms.push(roomName);
        }
        
        if(unexploredRooms.length > 0) {
            // Pick a random unexplored room
            const index = Math.floor(Math.random() * unexploredRooms.length);
            creep.memory.targetRoom = unexploredRooms[index];
            creep.say('🔍 New Room');
            return;
        }
        
        // If no unexplored rooms, check for rooms that were scouted long ago
        const oldScoutedRooms = [];
        
        for(const direction in exits) {
            const roomName = exits[direction];
            
            // Skip if we have fresh data
            if(Memory.roomData && Memory.roomData[roomName] && 
               Memory.roomData[roomName].lastScouted > Game.time - 5000) {
                continue;
            }
            
            oldScoutedRooms.push(roomName);
        }
        
        if(oldScoutedRooms.length > 0) {
            // Pick a random old scouted room
            const index = Math.floor(Math.random() * oldScoutedRooms.length);
            creep.memory.targetRoom = oldScoutedRooms[index];
            creep.say('🔍 Revisit');
            return;
        }
        
        // If we get here, all adjacent rooms are well-scouted
        // Move to a random exit to find a new room
        const directions = Object.keys(exits);
        if(directions.length > 0) {
            const randomDir = directions[Math.floor(Math.random() * directions.length)];
            creep.memory.targetRoom = exits[randomDir];
            creep.say('🔍 Random');
        } else {
            // No exits? Unlikely but just in case
            moveCoordinator.moveTo(creep, new RoomPosition(25, 25, creep.room.name));
        }
    },
    
    /**
     * Travel to a specified room
     */
    travelToRoom: function(creep, roomName) {
        if(creep.fatigue > 0) return; // Wait until we can move
        
        // Find exit to target room
        const exitDir = Game.map.findExit(creep.room, roomName);
        
        if(exitDir === ERR_NO_PATH) {
            // No path means the room might be inaccessible
            console.log(`Scout ${creep.name} can't find path to ${roomName}`);
            delete creep.memory.targetRoom;
            return;
        }
        
        const exit = creep.pos.findClosestByPath(exitDir);
        
        if(!exit) {
            // No exit found, try again next tick
            console.log(`Scout ${creep.name} can't find exit to ${roomName}`);
            return;
        }
        
        moveCoordinator.moveTo(creep, exit, {
            visualizePathStyle: {stroke: '#ffffff'},
            reusePath: 50 // Long reuse for room-to-room travel
        });
    }
};

module.exports = roleScout;