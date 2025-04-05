module.exports = {
    run(room) {
        if (!room.controller || !room.controller.my) return;

        if (Game.time % 10 !== 0) return;

        if (!Memory.rooms[room.name]) {
            Memory.rooms[room.name] = {
                sources: room.find(FIND_SOURCES).map(s => ({
                    id: s.id,
                    pos: { x: s.pos.x, y: s.pos.y }
                }))
            };
        }

        if (Game.time % 50 !== 0) return;

        const exits = Game.map.describeExits(room.name);
        let roomsToExplore = [];

        for (const dir in exits) {
            const roomName = exits[dir];
            const roomMem = Memory.rooms[roomName];

            if (!roomMem || !roomMem.lastVisit || Game.time - roomMem.lastVisit > 1000) {
                roomsToExplore.push(roomName);
            }
        }

        room.memory.needsExploration = roomsToExplore.length > 0;
    }
};
