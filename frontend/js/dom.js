import { DormitoryManager } from "./state.js";

export function generateBlocks() {
  const container = document.getElementById("blocksContainer");
  if (!container || !window.allRooms) return;

  container.innerHTML = "";

  const groupedByBlock = {};

  for (const room of window.allRooms) {
    if (!groupedByBlock[room.block]) {
      groupedByBlock[room.block] = [];
    }
    groupedByBlock[room.block].push(room);
  }

  for (const [blockName, rooms] of Object.entries(groupedByBlock)) {
    const blockDiv = document.createElement("div");
    blockDiv.className = "block";
    blockDiv.innerHTML = `<h2>${blockName}</h2>`;

    const floors = {};

    for (const room of rooms) {
      if (!floors[room.floor]) {
        floors[room.floor] = [];
      }
      floors[room.floor].push(room);
    }

    const sortedFloors = Object.keys(floors).sort((a, b) => b - a);

    for (const floor of sortedFloors) {
      const floorDiv = document.createElement("div");
      floorDiv.className = "floor";
      floorDiv.innerHTML = `<h3>Этаж ${floor}</h3>`;
      floorDiv.setAttribute("data-floor", floor);

      const roomContainer = document.createElement("div");
      roomContainer.className = "room-container";

      for (const room of floors[floor]) {
        const roomDiv = document.createElement("div");
        roomDiv.className = "room";
        roomDiv.setAttribute("data-room-id", room.id);
        roomDiv.innerHTML = `
          <div class="room-name">${room.id}</div>
          <div class="students"></div>
        `;

        const studentList = DormitoryManager.students[normalizeRoomId(room.id)] || [];
        const studentsDiv = roomDiv.querySelector(".students");

        for (const student of studentList) {
          if (student.left) continue; // показывать только активных
          const studentDiv = document.createElement("div");
          studentDiv.className = "student";
          studentDiv.textContent = student.fio;
          studentsDiv.appendChild(studentDiv);
        }

        roomContainer.appendChild(roomDiv);
      }

      floorDiv.appendChild(roomContainer);
      blockDiv.appendChild(floorDiv);
    }

    container.appendChild(blockDiv);
  }
}

export function setupLazyObserver() {
  const floors = document.querySelectorAll(".floor");

  const observer = new IntersectionObserver(
    (entries, observer) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      }
    },
    {
      rootMargin: "100px"
    }
  );

  floors.forEach((floor) => observer.observe(floor));
}

// Вспомогательная функция
function normalizeRoomId(roomId) {
  return (roomId || "").toLowerCase().replace(/\s/g, "");
}