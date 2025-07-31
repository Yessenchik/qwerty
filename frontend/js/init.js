import { generateBlocks, setupLazyObserver } from './dom.js';
import { DormitoryManager } from './state.js';

export async function init() {
  try {
    const res = await fetch("/api/rooms/all");
    if (!res.ok) throw new Error("Ошибка HTTP: " + res.status);
    const data = await res.json();
    window.allRooms = data;
    DormitoryManager.roomCapacities = {};
    data.forEach(room => {
      DormitoryManager.roomCapacities[room.id] = room.places;
    });
    generateBlocks();
    setupLazyObserver();

    const res2 = await fetch("/api/students");
    if (!res2.ok) throw new Error("Ошибка HTTP: " + res2.status);
    const data2 = await res2.json();
    DormitoryManager.students = {};
    data2.forEach(student => {
      const room = (student.room_id || "").toLowerCase().replace(/\s/g, "");
      if (!DormitoryManager.students[room]) DormitoryManager.students[room] = [];
      DormitoryManager.students[room].push({ ...student });
    });

    generateBlocks();
  } catch (err) {
    console.error("❌ Ошибка инициализации:", err);
    document.getElementById("blocksContainer").innerHTML =
      "<div style='color:red'>Не удалось загрузить данные с сервера.</div>";
  } finally {
    document.getElementById("loading")?.remove();
  }
}

document.addEventListener("DOMContentLoaded", init);