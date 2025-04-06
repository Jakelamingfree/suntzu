import "../types";

export const roomManager: Manager = {
    run(room: Room): void {
        if (!room.controller || !room.controller.my) return;

        // Only run every 10 ticks to save CPU
        if (Game.time % 10 !== 0) return;

        // Initialize room memory if needed
        if (!Memory.rooms[room.name]) {
            Memory.rooms[room.name] = {
                sources: room.find(FIND_SOURCES).map(s => ({
                    id: s.id,
                    pos: { x: s.pos.x, y: s.pos.y }
                }))
            };
        }

        // Every 50 ticks, check for rooms to explore
        if (Game.time % 50 !== 0) return;

        const exits = Game.map.describeExits(room.name);
        let roomsToExplore: string[] = [];

        for (const dir in exits) {
            const roomName = exits[dir];
            const roomMem = Memory.rooms[roomName];

            // If we haven't visited the room recently (or at all), add it to the exploration list
            if (!roomMem || !roomMem.lastVisit || Game.time - roomMem.lastVisit > 1000) {
                roomsToExplore.push(roomName);
            }
        }

        room.memory.needsExploration = roomsToExplore.length > 0;
    }
};
