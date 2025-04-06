import "../types";

export const roomUtils: UtilsModule = {
    findHostiles(room: Room): Creep[] {
        return room.find(FIND_HOSTILE_CREEPS, {
            filter: (c: Creep) => !c.owner || c.owner.username !== 'Invader'
        });
    },

    updateRoomMemory(room: Room): void {
        if (!Memory.rooms) Memory.rooms = {};
        if (!Memory.rooms[room.name]) Memory.rooms[room.name] = {};

        const mem = Memory.rooms[room.name];
        mem.lastVisit = Game.time;

        const hostiles = this.findHostiles(room);
        mem.hostilePresence = hostiles.length > 0;

        if (!mem.hostilePresence) {
            const sources = room.find(FIND_SOURCES);
            mem.sources = sources.map(s => ({
                id: s.id,
                pos: { x: s.pos.x, y: s.pos.y }
            }));
            
            if (room.controller) {
                mem.controller = {
                    id: room.controller.id,
                    pos: { x: room.controller.pos.x, y: room.controller.pos.y },
                    owner: room.controller.owner ? room.controller.owner.username : null,
                    reservation: room.controller.reservation ? room.controller.reservation.username : null
                };
            } else {
                mem.controller = null;
            }
        }
    }
};
