<script>
      // Вместимости комнат (заполняется из allRooms при загрузке)
      let roomCapacities = {};

      // === Глобальная переменная для текущей комнаты (используется в модалках) ===
      let currentRoom = "";

      // Данные будут загружены с сервера
      let students = {}; // Данные будут загружены с сервера
      let departedArchive = []; // Архив будет загружаться с сервера


      // --- Глобальное состояние ---
      const state = {
        currentRoom: null,
        currentFiltered: null,
        searchQuery: "",
        modals: {
          dossier: false,
          departed: false,
          notifications: false,
          todayAdded: false
        }
      };

      function addMonths(date, months) {
        let d = new Date(date);
        d.setMonth(d.getMonth() + months);
        return d;
      }

      // --- LAZY LOADING ROOMS ---
      /**
       * Создаёт floorDiv с заголовком и пустым ul.room-list, где данные комнат хранятся в data-атрибутах ul
       */
      function createFloorDiv(block, floor, stats) {
        const floorDiv = document.createElement("div");
        floorDiv.classList.add("floor");
        const h3 = document.createElement("h3");
        h3.textContent = `Этаж ${floor}`;
        floorDiv.appendChild(h3);
        // Собираем массив комнат и вместимости для передачи в data-атрибуты
        const floorRooms = blocksData[block][floor];
        // Сохраняем данные в data-атрибутах ul
        const ul = document.createElement("ul");
        ul.classList.add("room-list");
        ul.style.display = "none";
        ul.dataset.block = normalizeRoomId(block);
        ul.dataset.floor = floor;
        // Сохраняем массив комнат и вместимости в JSON в data-rooms
        ul.dataset.rooms = JSON.stringify(
          floorRooms.map(room => ({
            room: normalizeRoomId(room),
            capacity: roomCapacities[room] || 5
          }))
        );
        // Также можно сохранить статистику этажа, если нужно
        if (stats) {
          ul.dataset.stats = JSON.stringify(stats);
        }
        floorDiv.appendChild(ul);
        return { floorDiv, ul, h3 };
      }

      /**
       * Создаёт список комнат внутри ul на основании data-атрибутов и students.
       * Если уже создан, ничего не делает.
       * Теперь всегда рендерит все комнаты и всех студентов, независимо от поиска.
       */
      function lazyLoadRooms(ul, stats) {
        if (ul.dataset.loaded === "true") return;
        let rooms = [];
        try {
          rooms = JSON.parse(ul.dataset.rooms);
        } catch (e) {
          return;
        }
        ul.innerHTML = "";
        // Сортировка комнат по номеру (добавлено по инструкции)
        rooms.sort((a, b) => {
          const aNum = parseInt(a.room.split("-")[1]);
          const bNum = parseInt(b.room.split("-")[1]);
          return aNum - bNum;
        });
        rooms.forEach(({ room, capacity }) => {
          const roomStudents = students[room] || [];
          const activeStudents = roomStudents.filter((s) => !s.left);
          // Всегда показываем всех студентов (активных)
          const displayCount = activeStudents.length;
          // Создание элемента комнаты
          const li = document.createElement("li");
          li.classList.add("room");
          li.innerHTML = createRoomStatusHTML({ id: room, occupied: displayCount, places: capacity });
          if (activeStudents.length > 0) {
            const viewBtn = document.createElement("button");
            viewBtn.classList.add("btn");
            viewBtn.textContent = "Просмотр";
            viewBtn.addEventListener("click", () => {
              openDossierModal(room, null, activeStudents[0]?.iin);
            });
            li.appendChild(viewBtn);
          }
          ul.appendChild(li);
        });
        ul.dataset.loaded = "true";
      }

      /**
       * Настраивает IntersectionObserver для .floor, чтобы lazyLoadRooms вызывался при появлении этажа на экране.
       * Также раскрывает список при первом клике на этаж.
       */
      function setupLazyObserver() {
        const floors = document.querySelectorAll(".floor");
        const observer = new IntersectionObserver(
          (entries, obs) => {
            entries.forEach(entry => {
              if (entry.isIntersecting) {
                const floorDiv = entry.target;
                const ul = floorDiv.querySelector("ul.room-list");
                if (ul && ul.dataset.loaded !== "true") {
                  lazyLoadRooms(ul);
                }
              }
            });
          },
          { root: null, rootMargin: "0px", threshold: 0.08 }
        );
        floors.forEach(floorDiv => {
          observer.observe(floorDiv);
          // Добавляем обработчик клика для заголовка этажа
          const h3 = floorDiv.querySelector("h3");
          const ul = floorDiv.querySelector("ul.room-list");
          if (h3 && ul) {
            h3.addEventListener("click", () => {
              // Скрыть все room-list в этом блоке
              const allLists = floorDiv.parentElement.querySelectorAll(".room-list");
              allLists.forEach(list => {
                if (list !== ul) list.style.display = "none";
              });
              // Lazy load при первом раскрытии
              if (ul.dataset.loaded !== "true") {
                lazyLoadRooms(ul);
              }
              ul.style.display = ul.style.display === "none" ? "block" : "none";
            });
          }
        });
      }

      // --- Функции для отображения блоков и комнат в кириллице ---
      function convertToCyrillic(letter) {
        if (letter === 'A') return 'А';
        if (letter === 'B') return 'Б';
        if (letter === 'V') return 'В';
        return letter;
      }

      function convertRoomIdToCyrillic(roomId) {
        if (!roomId || typeof roomId !== 'string') return roomId;
        const parts = roomId.split('-');
        if (parts.length === 2) {
          return convertToCyrillic(parts[0]) + '-' + parts[1];
        }
        return roomId;
      }

      // Новая реализация generateBlocks() — использует allRooms {id, block, floor, places, occupied}
      function generateBlocks() {
        const container = document.getElementById("blocksContainer");
        container.innerHTML = "";

        if (typeof allRooms === "undefined" || !Array.isArray(allRooms)) {
          container.innerHTML = "<div style='color:red'>Нет данных о комнатах (allRooms не определён).</div>";
          return;
        }

        const blocks = {};
        allRooms.forEach(room => {
          const displayBlock = convertToCyrillic(room.block);
          if (!blocks[displayBlock]) blocks[displayBlock] = {};
          if (!blocks[displayBlock][room.floor]) blocks[displayBlock][room.floor] = [];
          blocks[displayBlock][room.floor].push(room);
        });

        let globalCapacity = 0;
        let globalOccupied = 0;

        for (let block in blocks) {
          const blockDiv = document.createElement("div");
          blockDiv.classList.add("block-column");
          blockDiv.innerHTML = `<h2>Блок ${convertToCyrillic(block)}</h2>`;

          let blockCapacity = 0;
          let blockOccupied = 0;

          for (let floor in blocks[block]) {
            const floorDiv = document.createElement("div");
            floorDiv.classList.add("floor");
            const h3 = document.createElement("h3");
            h3.textContent = `Этаж ${floor}`;
            const ul = document.createElement("ul");
            ul.classList.add("room-list");
            ul.style.display = "none";
            ul.dataset.block = normalizeRoomId(block);
            ul.dataset.floor = floor;
            ul.dataset.rooms = JSON.stringify(
              blocks[block][floor].map(roomObj => ({
                room: normalizeRoomId(roomObj.id),
                capacity: roomObj.places
              }))
            );
            // --- LOG ---
            // console.warn(`UL #${floor} — {block: ${ul.dataset.block}, floor: ${ul.dataset.floor}, rooms: ${ul.dataset.rooms}}`);

            // Проверка сохранённого состояния из localStorage
            const storageKey = `floor-${block}-${floor}`;
            const isOpened = localStorage.getItem(storageKey) === "true";
            if (isOpened) {
              ul.style.display = "block";
              // ul.dataset.openedByStorage = "true";
            }

            // Sort rooms
            const roomsSorted = blocks[block][floor].slice().sort((a, b) => {
              const aNum = parseInt(a.id.split("-")[1]);
              const bNum = parseInt(b.id.split("-")[1]);
              return aNum - bNum;
            });

            roomsSorted.forEach(({ id, places }) => {
              const normalizedId = normalizeRoomId(id);
              const roomStudents = students[normalizedId] || [];
              const occupied = roomStudents.filter(s => !s.left).length;

              const li = document.createElement("li");
              li.classList.add("room");
              li.innerHTML = `
                <span class="room-number">${convertRoomIdToCyrillic(id)}</span>
                <span class="room-counter room-status ${occupied >= places ? "occupied" : "free"}">
                  ${occupied}/${places}
                </span>
              `;
              // --- СПИСОК СТУДЕНТОВ ВНУТРИ КАЖДОЙ КОМНАТЫ УДАЛЁН ---
              li.appendChild(createViewButton(id));
              ul.appendChild(li);
              // --- Добавляем анимацию появления ---
              li.classList.add("fade-in");
              setTimeout(() => li.classList.remove("fade-in"), 500);

              blockCapacity += places;
              blockOccupied += occupied;
            });

            h3.addEventListener("click", () => {
              const isNowVisible = ul.style.display === "none";
              ul.style.display = isNowVisible ? "block" : "none";
              const storageKey = `floor-${block}-${floor}`;
              if (isNowVisible) {
                localStorage.setItem(storageKey, "true");
              } else {
                localStorage.removeItem(storageKey);
              }
            });

            floorDiv.appendChild(h3);
            floorDiv.appendChild(ul);
            blockDiv.appendChild(floorDiv);
          }

          const blockFree = blockCapacity - blockOccupied;
          // Новый подсчёт выбывших студентов в блоке:
          const blockLeft = Object.entries(students)
            .filter(([room]) => normalizeRoomId(room).startsWith(normalizeRoomId(block)))
            .flatMap(([, arr]) => arr)
            .filter(s => s.left)
            .length;
          const statsHTML = `<div class="block-stats">Вместимость: ${blockCapacity} мест | Занято: ${blockOccupied} | Свободно: ${blockFree} | Выбывшие: ${blockLeft}</div>`;
          blockDiv.insertAdjacentHTML("afterbegin", statsHTML);
          container.appendChild(blockDiv);

          globalCapacity += blockCapacity;
          globalOccupied += blockOccupied;
        }

        const globalFree = globalCapacity - globalOccupied;
        // Новый подсчёт выбывших студентов глобально:
        const globalLeft = Object.values(students).flat().filter(s => s.left).length;
        const globalStats = document.getElementById("globalStats");
        globalStats.textContent = `Общая статистика: Вместимость: ${globalCapacity} мест | Занято: ${globalOccupied} | Свободно: ${globalFree} | Выбывшие: ${globalLeft}`;
      }

      // --- Универсальная функция нормализации roomId ---
      function normalizeRoomId(roomId = "") {
        return roomId
          .replace(/А/g, 'A')
          .replace(/В/g, 'B')
          .replace(/С/g, 'C')
          .replace(/Е/g, 'E')
          .replace(/К/g, 'K')
          .replace(/М/g, 'M')
          .replace(/Н/g, 'H')
          .replace(/О/g, 'O')
          .replace(/Р/g, 'P')
          .replace(/Т/g, 'T')
          .replace(/Х/g, 'X');
      }

      // --- WebSocket обновление одной комнаты ---
      const socket = new WebSocket(`ws://${window.location.hostname}:3000`);

      socket.addEventListener("open", function () {
        console.log("🔌 WebSocket подключен");
      });

      socket.addEventListener("close", function () {
        console.warn("⚠️ WebSocket соединение закрыто");
      });

      socket.addEventListener("error", function (error) {
        console.error("❌ Ошибка WebSocket:", error);
      });

      socket.addEventListener("message", function (event) {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "roomUpdate" && data.roomId) {
            const rawRoomId = data.roomId;
            const normalizedRoomId = normalizeRoomId(rawRoomId);
            updateSingleRoom(normalizedRoomId, data.roomData);
            // generateBlocks(); // ❌ Удалено: мешает раскрытым этажам
          } else if (data.type === "newStudent" && data.student && data.roomId) {
            // --- [LOG] Проверка всех UL перед поиском комнаты ---
            console.warn("🔍 Проверка всех UL перед поиском комнаты:");
            document.querySelectorAll('ul.room-list').forEach((ul, i) => {
              console.log(`UL #${i}`, {
                block: ul.dataset.block,
                floor: ul.dataset.floor,
                rooms: ul.dataset.rooms
              });
            });

            // 1. Сразу после проверки:
            console.log("🧠 WebSocket: newStudent сообщение получено");
            console.log("📨 roomId:", data.roomId);
            console.log("👤 student:", data.student);
            const rawRoomId = data.roomId;
            const roomId = normalizeRoomId(rawRoomId);
            console.log("📦 Получен newStudent по комнате:", roomId);
            const { student } = data;
            const now = new Date();

            const safeStudent = {
              ...student,
              left: false,
              relative: student.relative || "",
              relativePhone: student.relativePhone || "",
              rentalPeriod: student.rentalPeriod || "",
              moveInDate: student.moveInDate || "",
              date_added: now.toDateString()
            };

            if (!students[roomId]) students[roomId] = [];
            students[roomId].push(safeStudent);
            // Если модалка открыта и показывает эту комнату — обновить UI
            if (document.getElementById("studentModal")?.style.display === "block" && currentRoom === roomId) {
              openRoomModal(roomId); // переоткрыть модалку, она перерисует студентов
            }
            // 🔄 Обновим счётчик комнаты
            const currentStudents = students[roomId]?.filter(s => !s.left) || [];
            const newRoomData = {
              places: roomCapacities[roomId] || 0,
              occupied: currentStudents.length
            };
            updateSingleRoom(roomId, newRoomData);
            // 2. После добавления студента:
            console.log("📊 Всего студентов в комнате", roomId, "=", students[roomId].length);
            // Обновляем модалку, если она сейчас открыта на эту комнату
            // 3. До вызова openDossierModal()
            console.log("📋 Модалка открыта?", document.getElementById("dossierModal").style.display);
            console.log("📍 currentRoom:", currentRoom, "| incoming roomId:", roomId);
            // --- Обновление .room-modal (если есть) ---
            const modal = document.querySelector(".room-modal");
            if (modal) {
              const title = modal.querySelector(".room-modal-title");
              if (title) {
                title.textContent = `Комната ${roomId}`;
              }
              const list = modal.querySelector(".room-modal-body");
              if (list) {
                list.innerHTML = "";
                students[roomId]?.forEach((student) => {
                  if (!student.left) {
                    const li = document.createElement("li");
                    li.textContent = student.fio;
                    list.appendChild(li);
                  }
                });
              }
            }
            if (document.getElementById("dossierModal").style.display === "flex" && currentRoom === roomId) {
              openDossierModal(roomId); // перерисовать список студентов
            }
            // roomList is not directly used here, but if you use it for searching elsewhere, update as follows:
            // Example: if (roomList.some(r => r.room === roomId)) { ... }
            // Replace with:
            // if (roomList.some(r => normalizeRoomId(r.room) === roomId)) { ... }

            const block = roomId.split("-")[0];
            const floor = roomId.split("-")[1].charAt(0);
            const ul = document.querySelector(`ul.room-list[data-block="${normalizeRoomId(block)}"][data-floor="${floor}"]`);

            // 4. После обновления ul:
            if (ul) {
              console.log("📁 Найден UL для блока", block, "этажа", floor);
              const roomsList = JSON.parse(ul.dataset.rooms || "[]");
              if (!roomsList.some(r => r.room === roomId)) {
                roomsList.push({ room: roomId, capacity: roomCapacities[roomId] || 0 });
                ul.dataset.rooms = JSON.stringify(roomsList);
              }
              if (ul.style.display !== "none") {
                ul.dataset.loaded = "false";
                ul.innerHTML = "";
                lazyLoadRooms(ul);
              }
            } else {
              console.warn("⚠️ UL не найден для блока", block, "этажа", floor);
            }

            // Отображение уведомления для всех пользователей
            showToast(`👤 Добавлен студент: ${data.student?.fio || "Неизвестный"} в комнату ${data.roomId}`, "success");
            // 5. После showToast(...)
            console.log("🔔 Toast показан:", `Добавлен студент: ${student.fio}`);
            // Если модалка "Сегодня добавили" открыта — перерисовать её
            if (document.getElementById("todayAddedModal").style.display === "flex") {
              openTodayAddedModal();
            }
            // generateBlocks(); // ❌ Удалено: мешает раскрытым этажам
          }
          // === Добавлено: обработка события globalUpdate ===
          else if (data.type === "globalUpdate") {
            console.log("🌐 Получен globalUpdate");
            fetch("/api/rooms/all")
              .then(res => res.json())
              .then(data => {
                allRooms = data;
                generateBlocks();
              });
          }
          // === Новый блок: обработка события studentLeft ===
          else if (data.type === "studentLeft" && data.student && data.room) {
            const { student, room } = data;
            showToast(`Студент выбыл: ${student.fio}`, "warning");

            if (!students[room]) students[room] = [];
            const found = students[room].find(s => s.iin === student.iin);
            if (found) {
              found.left = true;
              found.leftDate = student.leftDate || new Date().toISOString().split("T")[0];
            }

            // generateBlocks(); // ❌ Удалено: мешает раскрытым этажам
            if (currentRoom === room) openDossierModal(room);
            updateGlobalStats();
          }
          // === Новый блок: обработка события studentDeleted ===
          else if (data.type === "studentDeleted" && data.iin && data.room) {
            const room = normalizeRoomId(data.room);
            if (students[room]) {
              const index = students[room].findIndex(s => s.iin === data.iin);
              if (index !== -1) {
                students[room].splice(index, 1);
                showToast(`Студент удалён: ИИН ${data.iin}`, "info");
                // generateBlocks(); // ❌ Удалено: мешает раскрытым этажам
                if (currentRoom === room) openDossierModal(room);
              }
            }
          }
          // === Новый блок: обработка события studentUpdated ===
          else if (data.type === "studentUpdated" && data.student && data.room) {
            const room = normalizeRoomId(data.room);
            if (!students[room]) students[room] = [];
            const index = students[room].findIndex(s => s.iin === data.student.iin);
            if (index !== -1) {
              students[room][index] = { ...students[room][index], ...data.student };
            } else {
              students[room].push(data.student);
            }
            showToast(`Студент обновлён: ${data.student.fio}`, "info");
            // generateBlocks(); // ❌ Удалено: мешает раскрытым этажам
            if (currentRoom === room) openDossierModal(room);
            updateGlobalStats();
          }
          // === Новый блок: обработка события leftStudent ===
          else if (data.type === "leftStudent" && data.student && data.roomId) {
            const roomId = normalizeRoomId(data.roomId);
            // Удаляем студента из массива по roomId
            if (students[roomId]) {
              students[roomId] = students[roomId].filter(s => s.iin !== data.student.iin);
            }
            // Если модалка открыта и показывает эту комнату — обновить UI
            if (document.getElementById("studentModal")?.style.display === "block" && currentRoom === roomId) {
              openRoomModal(roomId); // переоткрыть модалку, она перерисует студентов
            }
            showToast(`🚪 Студент выбыл: ${data.student?.fio || "Неизвестный"} из комнаты ${data.roomId}`, "warning");
            // Можно добавить обновление комнаты, если нужно (например, updateSingleRoom)
            if (currentRoom === roomId) openDossierModal(roomId);
            updateGlobalStats();
          }

        } catch (e) {
          console.warn("Ошибка при обработке WebSocket сообщения:", e);
        }
      });

      // Вспомогательная функция для кнопки "Просмотр"
      function createViewButton(roomId) {
        const btn = document.createElement("button");
        btn.classList.add("btn");
        btn.textContent = "Просмотр";
        if (btn) {
          btn.addEventListener("click", () => {
            console.log("👁️ Клик на кнопку 'Просмотр' для комнаты:", roomId);
            openDossierModal(normalizeRoomId(roomId));
          });
        }
        return btn;
      }

      // --- Функция для обновления только одной комнаты (по WebSocket) ---
      function updateSingleRoom(roomId, data) {
        console.log("🔄 Обновление комнаты:", roomId, "→", data);
        const roomElements = document.querySelectorAll(".room");
        // Эта строка должна оставаться без изменений, чтобы .room находились корректно
        for (const roomElement of roomElements) {
          const roomNumberEl = roomElement.querySelector(".room-number");
          if (roomNumberEl && normalizeRoomId(roomNumberEl.innerText.trim()) === normalizeRoomId(roomId)) {
            const counter = roomElement.querySelector(".room-counter");
            if (counter) {
              counter.innerText = `${data.occupied}/${data.places}`;
              counter.className = `room-counter room-status ${data.occupied >= data.places ? "occupied" : "free"}`;
              console.log("✅ Обновлён счётчик комнаты", roomId, "→", counter.innerText);
            } else {
              console.warn("❌ Не найден .room-counter внутри .room");
            }
            // highlight room if parent ul is visible
            const ul = roomElement.closest("ul.room-list");
            if (ul && ul.style.display !== "none") {
              roomElement.classList.add("highlighted");
              setTimeout(() => roomElement.classList.remove("highlighted"), 2000);
            }
            updateGlobalStats(); // Обновление только глобальной статистики без перерисовки DOM
            return;
          }
        }

        console.warn("⚠️ Комната не найдена в DOM:", roomId);
      }

      function updateGlobalStats() {
        let globalCapacity = 0;
        let globalOccupied = 0;
        const allStudents = Object.values(students).flat();
        const globalLeft = allStudents.filter(s => s.left).length;

        for (let roomId in students) {
          const roomStudents = students[roomId];
          const activeCount = roomStudents.filter(s => !s.left).length;
          const roomPlaces = roomCapacities[roomId] || 0;
          globalOccupied += activeCount;
          globalCapacity += roomPlaces;
        }

        const globalFree = globalCapacity - globalOccupied;
        const globalStats = document.getElementById("globalStats");
        globalStats.textContent = `Общая статистика: Вместимость: ${globalCapacity} мест | Занято: ${globalOccupied} | Свободно: ${globalFree} | Выбывшие: ${globalLeft}`;
      }

      function openDossierModal(room, filtered = null, highlightIin = null) {
        currentRoom = room;
        console.log("📂 Открыто досье для комнаты:", room);
        const roomStudents = students[room] || [];
        const activeStudents = filtered !== null ? filtered.filter(s => !s.left) : roomStudents.filter(s => !s.left);
        console.log("🔍 В модалке активные студенты:");
        (activeStudents || []).forEach(s => console.log("  →", s.fio));

        state.currentRoom = room;
        const departedStudents = filtered !== null ? filtered.filter(s => s.left) : roomStudents.filter(s => s.left);
        state.currentFiltered = activeStudents;

        document.getElementById("dossierRoom").textContent = room;
        const dossierContent = document.getElementById("dossierContent");
        dossierContent.innerHTML = "";

        if (activeStudents.length === 0 && departedStudents.length === 0) {
          dossierContent.innerHTML = `<p>Студенты не найдены.</p>`;
        }

        // Активные студенты
        if (activeStudents.length > 0) {
          dossierContent.innerHTML += `<h3>Активные студенты</h3>`;
          activeStudents.forEach((student) => {
            let highlight = "";
            const searchQuery = document.getElementById("searchInput").value.trim().toLowerCase();
            if (searchQuery) {
              // Новая логика выделения совпадений по ФИО (по частям, startsWith)
              const fio = (student.fio || "").toLowerCase();
              const fioParts = fio.split(/\s+/);
              const fioMatch = fioParts.some(part => part.startsWith(searchQuery));
              const iinMatch = (student.iin || "").includes(searchQuery);
              if (fioMatch || iinMatch) {
                highlight = 'style="background-color: #cce5ff;"';
              }
            }
            else if (highlightIin && student.iin === highlightIin) {
              highlight = 'style="background-color: #cce5ff;"';
            }

            // Безопасная обработка moveInDate
            const moveInDateObj = student.moveInDate ? new Date(student.moveInDate) : null;
            let moveInDateFormatted = "—";
            if (moveInDateObj && !isNaN(moveInDateObj)) {
              moveInDateObj.setDate(moveInDateObj.getDate() + 1);
              moveInDateFormatted = moveInDateObj.toISOString().split("T")[0];
            }
            // Безопасная обработка moveOutDate
            let moveOutDateFormatted = "—";
            if (student.moveInDate && !isNaN(new Date(student.moveInDate))) {
              const temp = addMonths(new Date(student.moveInDate), parseInt(student.rentalPeriod));
              temp.setDate(temp.getDate() + 1);
              moveOutDateFormatted = temp.toISOString().split("T")[0];
            }

            dossierContent.innerHTML += `
              <div class="student-entry" ${highlight}>
                <p><strong>ФИО:</strong> ${student.fio}</p>
                <p><strong>ИИН:</strong> ${student.iin}</p>
                <p><strong>Телефон:</strong> ${student.phone}</p>
                <p><strong>Университет:</strong> ${student.university}</p>
                <p><strong>Родственник:</strong> ${student.relative}</p>
                <p><strong>Телефон родственника:</strong> ${student.relativePhone}</p>
                <p><strong>Сумма оплаты:</strong> ${Number(student.payment).toLocaleString("ru-RU")} ₸</p>
                <p><strong>Дата заселения:</strong> ${moveInDateFormatted}</p>
                <p><strong>Срок аренды:</strong> ${student.rentalPeriod} мес.</p>
                <p><strong>Окончание аренды:</strong> ${moveOutDateFormatted}</p>
                <p><strong>Статус:</strong> Активен</p>
                <button class="btn btn-danger" onclick="deleteStudent('${room}', '${student.iin}')">Удалить</button>
                <button class="btn" onclick="markStudentLeft('${room}', '${student.iin}')">Отметить как выбывшего</button>
                <button class="btn btn-warning" onclick="extendRentalPeriod('${room}', '${student.iin}')">Продлить аренду</button>
                <hr>
              </div>
            `;
          });
        }

        // Выбывшие студенты
        if (departedStudents.length > 0) {
          dossierContent.innerHTML += `<h3 style="margin-top: 20px;">Выбывшие студенты</h3>`;
          const departedSection = document.createElement("div");
          dossierContent.appendChild(departedSection);
          departedStudents.forEach((student) => {
            // Безопасная обработка moveInDate
            const moveInDateObj = student.moveInDate ? new Date(student.moveInDate) : null;
            let moveInDateFormatted = "—";
            if (moveInDateObj && !isNaN(moveInDateObj)) {
              moveInDateObj.setDate(moveInDateObj.getDate() + 1);
              moveInDateFormatted = moveInDateObj.toISOString().split("T")[0];
            }
            // Безопасная обработка moveOutDate
            let moveOutDateFormatted = "—";
            if (student.moveInDate && !isNaN(new Date(student.moveInDate))) {
              const temp = addMonths(new Date(student.moveInDate), parseInt(student.rentalPeriod));
              temp.setDate(temp.getDate() + 1);
              moveOutDateFormatted = temp.toISOString().split("T")[0];
            }
            // Безопасная обработка leftDate
            let leftDateFormatted = "—";
            if (student.leftDate && !isNaN(new Date(student.leftDate))) {
              const leftDateObj = new Date(student.leftDate);
              leftDateObj.setDate(leftDateObj.getDate() + 1);
              leftDateFormatted = leftDateObj.toISOString().split("T")[0];
            }

            const studentDiv = document.createElement("div");
            studentDiv.className = "student-entry";
            studentDiv.style.opacity = "0.7";

            // Новый блок: анимированная подсветка и прокрутка
            if (highlightIin && student.iin === highlightIin) {
              studentDiv.classList.add("highlighted-entry");
              requestAnimationFrame(() => {
                studentDiv.scrollIntoView({ behavior: "smooth", block: "center" });
              });
              setTimeout(() => {
                studentDiv.classList.remove("highlighted-entry");
              }, 2500);
            }

            studentDiv.innerHTML = `
              <p><strong>ФИО:</strong> ${student.fio}</p>
              <p><strong>ИИН:</strong> ${student.iin}</p>
              <p><strong>Телефон:</strong> ${student.phone}</p>
              <p><strong>Университет:</strong> ${student.university}</p>
              <p><strong>Сумма оплаты:</strong> ${Number(student.payment).toLocaleString("ru-RU")} ₸</p>
              <p><strong>Дата заселения:</strong> ${moveInDateFormatted}</p>
              <p><strong>Срок аренды:</strong> ${student.rentalPeriod} мес.</p>
              <p><strong>Плановая дата окончания аренды:</strong> ${moveOutDateFormatted}</p>
              <p><strong>Фактическая дата выбытия:</strong> ${leftDateFormatted}</p>
              <p><strong>Статус:</strong> Выбывший</p>
              <hr>
            `;

            departedSection.appendChild(studentDiv);
          });
        }

        // --- SCROLL AND HIGHLIGHT BY IIN ---
        // (Удалено: теперь это делается непосредственно при создании studentDiv)

        state.modals.dossier = true;
        document.getElementById("dossierModal").style.display = "flex";
      }

      // ---- Новый механизм продления аренды через модалку ----
      let extendTarget = { room: null, iin: null };

      function extendRentalPeriod(room, iin) {
        extendTarget = { room, iin };
        document.getElementById("extendRentalHidden").value = "";
        document.getElementById("displayExtendRental").textContent = "Выберите срок";
        document.getElementById("extendRentalModal").style.display = "flex";
      }

      function closeExtendModal() {
        document.getElementById("extendRentalModal").style.display = "none";
      }

      function confirmExtendRental() {
        const { room, iin } = extendTarget;
        const student = students[room]?.find(s => s.iin === iin);
        if (!student) return;

        const extraMonths = parseInt(document.getElementById("extendRentalHidden").value);
        if (isNaN(extraMonths) || extraMonths <= 0) {
          showToast("Неверное значение", "error");
          return;
        }

        student.rentalPeriod = String(parseInt(student.rentalPeriod || "0") + extraMonths);

        fetch(`/api/students/update`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ room, iin, rentalPeriod: student.rentalPeriod })
        })
          .then(res => res.json())
          .then(data => {
            if (data.success) {
              showToast("Срок аренды прмодлён", "success");
              closeExtendModal();
              openDossierModal(room); // Обновить UI
              updateGlobalStats();
            } else {
              showToast("Ошибка при обновлении", "error");
            }
          })
          .catch(err => {
            console.error("Ошибка продления:", err);
            showToast("Ошибка сети", "error");
          });
      }

      function closeDossierModal() {
        document.getElementById("dossierModal").style.display = "none";
        state.currentRoom = null;
        state.currentFiltered = null;
        state.modals.dossier = false;
      }



      // --- Функция для редактирования студента ---
      function editStudent(room, iin) {
        state.currentRoom = room;
        const student = (students[room] || []).find(s => s.iin === iin);
        if (!student) return;
        document.getElementById("inputRoom").value = room;
        document.getElementById("addRoomLabel").textContent = room;
        document.getElementById("inputFio").value = student.fio;
        document.getElementById("inputIin").value = student.iin;
        document.getElementById("inputPhone").value = student.phone;
        document.getElementById("inputUniversity").value = student.university;
        document.getElementById("inputRelative").value = student.relative;
        document.getElementById("inputRelativePhone").value = student.relativePhone;
        document.getElementById("inputPayment").value = student.payment;
        document.getElementById("inputMoveInDate").value = student.moveInDate;
        document.getElementById("inputRentalPeriod").value = student.rentalPeriod;
        const form = document.getElementById("addStudentForm");
        form.dataset.editing = iin;
        const submitButton = form.querySelector('button[type="submit"]');
        submitButton.textContent = "Сохранить изменения";
        document.getElementById("addStudentModal").style.display = "flex";
      }

      function deleteStudent(room, iin) {
        if (confirm(`Удалить студента с ИИН ${iin} из комнаты ${room}?`)) {
          fetch(`/api/students/delete/${encodeURIComponent(iin)}`, {
            method: "DELETE"
          })
          .then(res => {
            if (res.ok) {
              showToast("Студент удален!", "info");
              if (students[room]) {
                const index = students[room].findIndex((s) => s.iin === iin);
                if (index !== -1) {
                  students[room].splice(index, 1);
                }
              }
              generateBlocks();
              const searchQuery = document.getElementById("searchInput").value.trim().toLowerCase();
              if (searchQuery) {
                const filtered = (students[room] || []).filter(
                  (s) =>
                    s.fio.toLowerCase().includes(searchQuery) ||
                    s.iin.toLowerCase().includes(searchQuery)
                );
                openDossierModal(room, filtered);
              } else {
                openDossierModal(room);
              }
            } else {
              showToast("Ошибка при удалении студента", "error");
            }
          })
          .catch(err => {
            console.error("❌ Ошибка удаления студента:", err);
            showToast("Ошибка при удалении студента", "error");
          });
        }
      }

      function markStudentLeft(room, iin) {
        if (students[room]) {
          const student = students[room].find((s) => s.iin === iin);
          if (student && !student.left) {
            if (confirm(`Отметить студента с ИИН ${iin} как выбывшего?`)) {
              socket.send(JSON.stringify({
                type: "markAsLeft",
                iin,
                room
              }));
              showToast("Отправлено на сервер: отметка как выбывшего", "info");
            }
          }
        }
      }

      // Универсальная функция для отображения карточки студента (используется в нескольких модалках)
      function renderStudentCard({ full_name, iin, room, rent_end, student, color = "#777", label = "", onClick = null }) {
        const div = document.createElement("div");
        div.style.marginBottom = "12px";
        div.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div><strong>${full_name}</strong></div>
              <div style="font-size: 13px; color: #555;">ИИН: ${iin}</div>
              <div style="font-size: 13px; color: ${color};">Комната: ${room || "—"}</div>
              ${label ? `<div style="font-size: 13px; color: ${color};">${label}</div>` : ""}
            </div>
            <div style="text-align: right;">
              <button class="btn btn-sm btn-primary">Просмотр</button>
            </div>
          </div>
        `;
        const btn = div.querySelector("button");
        if (onClick) {
          btn.addEventListener("click", onClick);
        }
        return div;
      }

      function openDepartedModal() {
        state.modals.departed = true;
        const modal = document.getElementById("departedModal");
        const content = document.getElementById("departedContent");
        content.innerHTML = "";

        const today = new Date();
        const departedStudents = [];

        for (let room in students) {
          students[room].forEach((s) => {
            if (s.left) {
              departedStudents.unshift({ room, student: s });
            }
          });
        }

        const count = departedStudents.length;
        const countLine = document.createElement("p");
        countLine.innerHTML = `<strong>Всего выбывших студентов:</strong> ${count}`;
        content.appendChild(countLine);

        if (count === 0) {
          content.innerHTML += `<p>Архив пуст.</p>`;
        } else {
          departedStudents.forEach(({ room, student }) => {
            const div = document.createElement("div");
            div.style.marginBottom = "12px";
            div.innerHTML = `
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <div><strong>${student.fio}</strong></div>
                  <div style="font-size: 13px; color: #555;">ИИН: ${student.iin}</div>
                </div>
                <div style="text-align: right;">
                  <div style="font-size: 13px; color: #777;">${room}</div>
                  <button class="btn btn-sm btn-primary">Просмотр</button>
                </div>
              </div>
            `;
            const btn = div.querySelector("button");
            btn.addEventListener("click", () => {
              // Показываем досье по комнате, но выделяем нужного студента
              modal.style.display = "none";
              setTimeout(() => {
                openDossierModal(room, null, student.iin);
              }, 100);
            });
            content.appendChild(div);
          });
        }

        modal.style.display = "flex";
      }

      function closeDepartedModal() {
        document.getElementById("departedModal").style.display = "none";
        state.modals.departed = false;
      }

      function normalizeDate(date) {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        return d;
      }


      // Функция для вычисления дней до окончания аренды
      function getDaysLeft(dateStr) {
        const expire = new Date(dateStr);
        const today = new Date();
        expire.setHours(0, 0, 0, 0);
        today.setHours(0, 0, 0, 0);
        return Math.round((expire - today) / (1000 * 60 * 60 * 24));
      }

      // --- Универсальная функция получения имени комнаты по студенту и allRooms ---
      function getStudentRoomName(student, allRooms) {
        if (!student || (!student.room_id && !student.room_number)) return "Неизвестно";
        if (student.room_number) return student.room_number;

        const room = allRooms.find(r => r.room_id === student.room_id || r.id === student.room_id);
        return room ? (room.room_number || room.id || room.room_id) : "Неизвестно";
      }

      // Новая версия модалки уведомлений с отображением студентов как в "Архиве выбывших"
      function openNotificationsModal() {
        state.modals.notifications = true;
        const modal = document.getElementById('notificationsModal');
        const expiredContent = document.getElementById('expiredContent');
        const expiringContent = document.getElementById('expiringContent');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const in7Days = new Date(today);
        in7Days.setDate(today.getDate() + 7);

        expiredContent.innerHTML = '';
        expiringContent.innerHTML = '';

        const expired = [];
        const expiring = [];

        // Собираем карту комнат по id для быстрого поиска
        const roomMap = {};
        if (typeof allRooms !== "undefined" && Array.isArray(allRooms)) {
          allRooms.forEach(room => {
            roomMap[normalizeRoomId(room.id)] = room;
          });
        }

        // Собираем всех студентов (по всем комнатам)
        Object.entries(students).forEach(([roomId, arr]) => {
          arr.forEach(student => {
            // --- Надёжная обработка даты окончания аренды ---
            let rent_end = null;
            const parsedDate = new Date(student.moveInDate);
            if (!isNaN(parsedDate) && student.rentalPeriod) {
              rent_end = addMonths(parsedDate, parseInt(student.rentalPeriod));
              rent_end.setHours(0, 0, 0, 0);
            }
            if (!rent_end || isNaN(rent_end)) return;
            // --- Надёжная обработка left ---
            const hasLeft = !!student.left;
            // Комната для отображения
            let roomName = "";
            let roomObj = roomMap[normalizeRoomId(roomId)];
            if (roomObj) {
              roomName = roomObj.name || roomObj.room_number || roomObj.id || "";
            }
            if (!roomName) {
              roomName = student.room_number || student.room_name || student.room_id || roomId || "";
            }
            // ФИО, ИИН
            const fio = student.fio || student.full_name || "";
            const iin = student.iin || "";
            // Для вывода даты окончания
            const rent_end_str = rent_end.toISOString().split("T")[0];
            // Истёкшие (выбывшие)
            if (hasLeft) {
              expired.push({
                room: roomName,
                roomId: roomId,
                full_name: fio,
                iin: iin,
                rent_end: rent_end_str,
                student: student
              });
            }
            // Истекают в ближайшие 7 дней (не выбывшие)
            else if (rent_end >= today && rent_end <= in7Days) {
              expiring.push({
                room: roomName,
                roomId: roomId,
                full_name: fio,
                iin: iin,
                rent_end: rent_end_str,
                student: student
              });
            }
          });
        });

        // Сортировка по rent_end убыванию (новее выше)
        expired.sort((a, b) => new Date(b.rent_end) - new Date(a.rent_end));
        expiring.sort((a, b) => new Date(b.rent_end) - new Date(a.rent_end));

        // --- Секция "Истекли"
        if (expired.length > 0) {
          const countLine = document.createElement("p");
          countLine.innerHTML = `<strong>Студентов с истёкшим сроком аренды:</strong> ${expired.length}`;
          expiredContent.appendChild(countLine);
          expired.forEach(({ room, roomId, full_name, iin, rent_end, student }) => {
            const card = renderStudentCard({
              full_name,
              iin,
              room,
              rent_end,
              student,
              color: "#c00",
              label: `Окончание аренды: ${rent_end}`,
              onClick: () => {
                modal.style.display = "none";
                setTimeout(() => {
                  openDossierModal(roomId, null, iin);
                }, 100);
              }
            });
            expiredContent.appendChild(card);
          });
        } else {
          expiredContent.innerHTML = '<p>Нет студентов с истёкшим сроком аренды.</p>';
        }

        // --- Секция "Истекают"
        if (expiring.length > 0) {
          const countLine = document.createElement("p");
          countLine.innerHTML = `<strong>Студентов с истекающим сроком аренды:</strong> ${expiring.length}`;
          expiringContent.appendChild(countLine);
          expiring.forEach(({ room, roomId, full_name, iin, rent_end, student }) => {
            const card = renderStudentCard({
              full_name,
              iin,
              room,
              rent_end,
              student,
              color: "#b97a00",
              label: `Окончание аренды: ${rent_end}`,
              onClick: () => {
                modal.style.display = "none";
                setTimeout(() => {
                  openDossierModal(roomId, null, iin);
                }, 100);
              }
            });
            expiringContent.appendChild(card);
          });
        } else {
          expiringContent.innerHTML = '<p>Нет студентов с истекающим сроком аренды.</p>';
        }

        // Отображение модального окна и табов
        modal.style.display = 'flex';
        // Табы
        const expiredTab = document.getElementById("expiredTab");
        const expiringTab = document.getElementById("expiringTab");
        expiredTab.classList.add("active");
        expiringTab.classList.remove("active");
        expiredContent.style.display = "block";
        expiringContent.style.display = "none";
        expiredTab.onclick = () => {
          expiredTab.classList.add("active");
          expiringTab.classList.remove("active");
          expiredContent.style.display = "block";
          expiringContent.style.display = "none";
        };
        expiringTab.onclick = () => {
          expiredTab.classList.remove("active");
          expiringTab.classList.add("active");
          expiredContent.style.display = "none";
          expiringContent.style.display = "block";
        };
      }

      function closeNotificationsModal() {
        document.getElementById("notificationsModal").style.display = "none";
        state.modals.notifications = false;
      }

      function openTodayAddedModal() {
        state.modals.todayAdded = true;
        console.log("📅 DEBUG: Текущее состояние students объекта", students);
        const modal = document.getElementById("todayAddedModal");
        const content = document.getElementById("todayAddedContent");
        content.innerHTML = ""; // очистим содержимое

        // Новый цикл сравнения дат без учета времени и временной зоны
        let today = new Date();
        const todayStr = today.toISOString().split("T")[0];
        let addedTodayCount = 0;
        let todayStudents = [];
        for (let room in students) {
          students[room].forEach(s => {
            if (!s.left && s.moveInDate) {
              const moveIn = new Date(s.moveInDate);
              moveIn.setDate(moveIn.getDate() + 1);
              if (!isNaN(moveIn)) {
                const moveInDateStr = moveIn.toISOString().split("T")[0];
                if (moveInDateStr === todayStr) {
                  addedTodayCount++;
                  // Добавляем новых студентов в начало, чтобы порядок был от последнего к первому
                  todayStudents.unshift({ fio: s.fio, room, iin: s.iin, date_added: s.date_added });
                }
              } else {
                console.warn("⚠️ Пропущен студент с некорректной датой:", s.fio, "→", s.moveInDate);
              }
            }
          });
        }
        // Удаляем сортировку — порядок уже соответствует поступлению (новые в начале)
        // todayStudents.sort(...);
        console.log("Уникальных заселённых сегодня:", addedTodayCount);

        if (todayStudents.length === 0) {
          const countLine = document.createElement("p");
          countLine.innerHTML = `<strong>Уникальных заселённых сегодня:</strong> 0`;
          content.appendChild(countLine);
          content.innerHTML += `<p>Сегодня никто не заселился.</p>`;
        } else {
          const countLine = document.createElement("p");
          countLine.innerHTML = `<strong>Уникальных заселённых сегодня:</strong> ${addedTodayCount}`;
          content.appendChild(countLine);

          todayStudents.forEach(({ fio, room, iin }) => {
            const div = document.createElement("div");
            div.style.marginBottom = "12px";
            div.innerHTML = `
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <div><strong>${fio}</strong></div>
                  <div style="font-size: 13px; color: #555;">ИИН: ${iin}</div>
                </div>
                <div style="text-align: right;">
                  <div style="font-size: 13px; color: #777;">${room}</div>
                  <button class="btn btn-sm btn-primary">Просмотр</button>
                </div>
              </div>
            `;
            const btn = div.querySelector("button");
            btn.addEventListener("click", () => {
              const active = students[room]?.filter(s => !s.left) || [];
              openDossierModal(room, active, iin);
              modal.style.display = "none";
            });
            content.appendChild(div);
          });
        }
        modal.style.display = "flex";
      }

      function closeTodayAddedModal() {
        document.getElementById("todayAddedModal").style.display = "none";
        state.modals.todayAdded = false;
      }

      document
        .getElementById("closeDossierModal")
        .addEventListener("click", closeDossierModal);
      document
        .getElementById("closeDepartedModal")
        .addEventListener("click", closeDepartedModal);
      document
        .getElementById("closeNotificationsModal")
        .addEventListener("click", closeNotificationsModal);
      document
        .getElementById("closeTodayAddedModal")
        .addEventListener("click", closeTodayAddedModal);

      window.addEventListener("click", (event) => {
        const dossierModal = document.getElementById("dossierModal");
        const departedModal = document.getElementById("departedModal");
        const notificationsModal =
          document.getElementById("notificationsModal");
        const todayAddedModal = document.getElementById("todayAddedModal");
        if (event.target === dossierModal) closeDossierModal();
        if (event.target === departedModal) closeDepartedModal();
        if (event.target === notificationsModal) closeNotificationsModal();
        if (event.target === todayAddedModal) closeTodayAddedModal();
      });

      // --- ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ: createRoomStatusHTML ---
      function createRoomStatusHTML({ id, occupied, places }) {
        return `<span class="room-number">${id}</span>
          <span class="room-counter room-status ${occupied >= places ? "occupied" : "free"}">${occupied}/${places}</span>`;
      }

      // --- Обновлённая функция updateBlockStats ---
      function updateBlockStats(blockDiv) {
        if (!blockDiv) return;
        const statsEl = blockDiv.querySelector(".block-stats");
        if (!statsEl) return;

        const ulElements = blockDiv.querySelectorAll("ul.room-list");
        let blockCapacity = 0;
        let blockOccupied = 0;
        let blockLeft = 0;

        ulElements.forEach(ul => {
          try {
            const rooms = JSON.parse(ul.dataset.rooms || "[]");
            rooms.forEach(({ room, capacity }) => {
              const roomStudents = students[room] || [];
              const activeCount = roomStudents.filter(s => !s.left).length;
              const leftCount = roomStudents.filter(s => s.left).length;
              blockOccupied += activeCount;
              blockLeft += leftCount;
              blockCapacity += capacity || 0;
            });
          } catch (e) {
            console.warn("❌ Ошибка в updateBlockStats:", e);
          }
        });

        const blockFree = blockCapacity - blockOccupied;
        statsEl.innerHTML = `Вместимость: ${blockCapacity} мест | Занято: ${blockOccupied} | Свободно: ${blockFree} | Выбывшие: ${blockLeft}`;
      }

      (function setupExtendRentalSelect() {
        const display = document.getElementById("displayExtendRental");
        const options = document.getElementById("optionsExtendRental");
        const hiddenInput = document.getElementById("extendRentalHidden");

        display.addEventListener("click", () => {
          const isOpen = options.style.display === "block";
          document.querySelectorAll(".custom-options").forEach(o => o.style.display = "none");
          document.querySelectorAll(".custom-select").forEach(d => d.classList.remove("active"));
          if (!isOpen) {
            options.style.display = "block";
            display.classList.add("active");
          }
        });

        options.querySelectorAll("div").forEach(opt => {
          opt.addEventListener("click", () => {
            const val = opt.getAttribute("data-value");
            hiddenInput.value = val;
            display.textContent = opt.textContent;
            options.querySelectorAll("div").forEach(d => d.classList.remove("selected"));
            opt.classList.add("selected");
            options.style.display = "none";
          });
        });

        window.addEventListener("click", (e) => {
          if (!e.target.closest(".custom-select-wrapper")) {
            options.style.display = "none";
            display.classList.remove("active");
          }
        });
      })();

      // --- Новый обработчик поиска по студентам и комнатам с подсветкой и счётчиком ---
      const searchInput = document.getElementById("searchInput");
      const resultCount = document.getElementById("resultCount");

      function handleSearchInput() {
        const normalize = str => str.replace(/\s+/g, "").toLowerCase();
        const query = normalize(searchInput.value);
        state.searchQuery = query;
        let foundCount = 0;

        // Убираем все выделения и подсветки
        document.querySelectorAll(".highlighted-room").forEach(room => {
          room.classList.remove("highlighted-room");
        });
        document.querySelectorAll(".highlighted").forEach(room => {
          room.classList.remove("highlighted");
        });

        // Если поисковый запрос пуст, скрываем счётчик и ничего не подсвечиваем
        if (!query) {
          resultCount.textContent = "";
          // Сбросить все подсветки
          document.querySelectorAll(".highlighted-room").forEach(room => room.classList.remove("highlighted-room"));
          document.querySelectorAll(".highlighted").forEach(room => room.classList.remove("highlighted"));
          // Скрыть все автоматически раскрытые этажи
          document.querySelectorAll('ul.room-list[data-opened-by-search="true"]').forEach(ul => {
            ul.style.display = "none";
            delete ul.dataset.openedBySearch;
          });
          return;
        }

        // --- Новый набор для совпадающих комнат ---
        const matchingRoomIds = new Set();

        // Собираем все .room элементы и ищем совпадения
        document.querySelectorAll(".room").forEach(roomEl => {
          // Найти roomId по .room-number
          const roomNumEl = roomEl.querySelector(".room-number");
          if (!roomNumEl) return;
          const roomId = normalizeRoomId(roomNumEl.textContent.trim());
          const roomStudents = students[roomId] || [];
          // Проверяем всех студентов (только не выбывших)
          let matchedInRoom = 0;
          for (const student of roomStudents) {
            if (
              !student.left &&
              (normalize(student.fio).startsWith(query) || normalize(student.iin).startsWith(query))
            ) {
              matchedInRoom++;
              foundCount++;
              matchingRoomIds.add(normalizeRoomId(student.room_id));
            }
          }
          if (matchedInRoom > 0) {
            roomEl.classList.add("highlighted-room");
            // Автоматически раскрыть этаж, если он содержит совпадения
            const ul = roomEl.closest("ul.room-list");
            if (ul && ul.style.display === "none") {
              ul.style.display = "block";
              ul.dataset.openedBySearch = "true";
            }
          } else {
            roomEl.classList.remove("highlighted-room");
          }
        });

        // --- Открыть нужные этажи и подсветить комнаты по совпадениям ---
        const ulElements = document.querySelectorAll("ul[data-block][data-floor]");
        ulElements.forEach(ul => {
          const roomList = JSON.parse(ul.dataset.rooms || "[]");
          const shouldOpen = roomList.some(r => matchingRoomIds.has(r.room));
          if (shouldOpen) {
            ul.style.display = "block";
          }
          roomList.forEach(r => {
            if (matchingRoomIds.has(r.room)) {
              const roomDiv = document.getElementById(r.room);
              if (roomDiv) {
                roomDiv.classList.add("highlighted");
                roomDiv.scrollIntoView({ behavior: "smooth", block: "center" });
                setTimeout(() => roomDiv.classList.remove("highlighted"), 1500);
              }
            }
          });
        });

        resultCount.textContent = `Найдено: ${foundCount}`;
      }

      searchInput.addEventListener("input", handleSearchInput);
      document
        .getElementById("archiveBtn")
        .addEventListener("click", openDepartedModal);
      document
        .getElementById("notificationsBtn")
        .addEventListener("click", openNotificationsModal);
      document
        .getElementById("todayAddedBtn")
        .addEventListener("click", openTodayAddedModal);

      // --- Ищем и заменяем вызовы openNotificationsModal(event) или openNotificationsModal() на openNotificationsModal(students) ---
      // Заменяем возможные вызовы openNotificationsModal(event) или openNotificationsModal() на openNotificationsModal(Object.values(students).flat())
      // (если такие вызовы есть в других местах, кроме addEventListener)
      // Поиск по коду показал, что только addEventListener("click", openNotificationsModal) был, остальные не обнаружены.
      function showError(el, message) {
        removeError(el);
        el.classList.remove("valid");
        el.style.border = "2px solid red";
        el.setAttribute("data-tooltip", message);
        el.classList.add("tooltip");

        const error = document.createElement("div");
        error.className = "field-error";
        error.textContent = message;

        const label = el.closest("label");
        if (label) {
          label.insertAdjacentElement("afterend", error);
        }

        const summary = document.getElementById("formErrorSummary");
        if (summary && !summary.innerHTML.includes(message)) {
          summary.style.display = "block";
          summary.innerHTML += `<div>• ${message}</div>`;
        }
      }

      function removeError(el) {
        el.style.border = "";
        el.classList.remove("tooltip");
        el.removeAttribute("data-tooltip");
        el.classList.remove("field-error");
        el.classList.add("valid");

        const label = el.closest("label");
        const next = label?.nextElementSibling;
        if (next && next.classList && next.classList.contains("field-error")) {
          next.remove();
        }

        const summary = document.getElementById("formErrorSummary");
        if (summary) {
          summary.innerHTML = "";
          summary.style.display = "none";
        }
      }

      function sanitizeNumericInput(event) {
        const original = event.target.value;
        const cleaned = original.replace(/\D/g, "");
        event.target.value = cleaned;
      }

      // Маска для телефона +7 XXX XXX XXXX
      function formatPhoneInput(event) {
        let input = event.target.value.replace(/\D/g, "");
        if (input.startsWith("7")) {
          input = input.slice(1); // remove leading 7 if present
        }
        input = input.slice(0, 10); // max 10 digits after +7
        let formatted = "+7 ";
        if (input.length > 0) {
          formatted += input.substring(0, 3);
        }
        if (input.length >= 4) {
          formatted += " " + input.substring(3, 6);
        }
        if (input.length >= 7) {
          formatted += " " + input.substring(6, 10);
        }
        event.target.value = formatted.trim();
      }

      // Все действия с DOM-элементами должны быть внутри DOMContentLoaded!
      document.addEventListener("DOMContentLoaded", function () {
        // 🔄 Обновление has_left при открытии страницы
        fetch("/api/update-has-left", { method: "POST" })
          .then(res => res.json())
          .then(data => {
            if (data.success) {
              console.log("✅ has_left обновлён при загрузке страницы");
            } else {
              console.warn("⚠️ Не удалось обновить has_left:", data.error);
            }
          })
          .catch(err => {
            console.error("❌ Ошибка при обновлении has_left:", err);
          });
        const phoneInput = document.getElementById("inputPhone");
        const relativePhoneInput = document.getElementById("inputRelativePhone");
        const iinInput = document.getElementById("inputIin");
        const fioEl = document.getElementById("inputFio");
        const universityEl = document.getElementById("inputUniversity");
        const relativeEl = document.getElementById("inputRelative");
        const paymentEl = document.getElementById("inputPayment");
        const rentalPeriodEl = document.getElementById("inputRentalPeriod");
        const addedByEl = document.getElementById("inputAddedBy");
        flatpickr("#inputMoveInDate", {
          dateFormat: "Y-m-d",
          defaultDate: new Date(),
          locale: "ru",
          minDate: null,
        });

        [
          fioEl,
          iinInput,
          phoneInput,
          universityEl,
          relativeEl,
          relativePhoneInput,
          paymentEl,
          rentalPeriodEl,
        ].forEach((el) => {
          el.addEventListener("focus", function () {
            el.style.border = "";
          });
        });

        // === Валидация по blur (потере фокуса) ===
        fioEl.addEventListener("blur", () => {
          removeError(fioEl);
          if (!fioEl.value.trim()) showError(fioEl, "Поле обязательно");
        });
        iinInput.addEventListener("blur", () => {
          removeError(iinInput);
          if (!/^\d{12}$/.test(iinInput.value.trim())) showError(iinInput, "Введите ИИН из 12 цифр");
        });
        paymentEl.addEventListener("blur", () => {
          removeError(paymentEl);
          if (!paymentEl.value.trim()) showError(paymentEl, "Поле обязательно");
        });
        const moveInDateEl = document.getElementById("inputMoveInDate");
        moveInDateEl.addEventListener("blur", () => {
          removeError(moveInDateEl);
          if (!moveInDateEl.value.trim()) showError(moveInDateEl, "Поле обязательно");
        });

        // Улучшенная валидация телефонов
        function validatePhones() {
          removeError(phoneInput);
          removeError(relativePhoneInput);

          const phoneVal = phoneInput.value.trim();
          const relativeVal = relativePhoneInput.value.trim();
          const pattern = /^\+7 \d{3} \d{3} \d{4}$/;

          if (phoneVal && !pattern.test(phoneVal)) {
            showError(phoneInput, "Введите номер в формате +7 XXX XXX XXXX");
          }
          if (relativeVal && !pattern.test(relativeVal)) {
            showError(relativePhoneInput, "Введите номер в формате +7 XXX XXX XXXX");
          }

          if (pattern.test(phoneVal) && pattern.test(relativeVal) && phoneVal === relativeVal) {
            showError(phoneInput, "Нельзя вводить одинаковые номера телефонов!");
            showError(relativePhoneInput, "Нельзя вводить одинаковые номера телефонов!");
          }
        }

        phoneInput.addEventListener("input", formatPhoneInput);
        relativePhoneInput.addEventListener("input", formatPhoneInput);

        phoneInput.addEventListener("blur", validatePhones);
        relativePhoneInput.addEventListener("blur", validatePhones);
        iinInput.addEventListener("input", function (e) {
          sanitizeNumericInput(e);
        });
      });

      function copyMoveInDate() {
        const input = document.getElementById("inputMoveInDate");
        if (input && input.value) {
          navigator.clipboard.writeText(input.value).then(() => {
            showToast("Дата скопирована!", "info");
          });
        }
      }

      function copyPhone(id) {
        const input = document.getElementById(id);
        if (input && input.value) {
          const raw = input.value.replace(/\D/g, "");
          navigator.clipboard
            .writeText("+7" + raw.substring(raw.length - 10))
            .then(() => {
              showToast("Телефон скопирован!", "info");
            });
        }
      }

      function copySelectValue(id) {
        const select = document.getElementById(id);
        if (select && select.value) {
          navigator.clipboard.writeText(select.value).then(() => {
            showToast("Скопировано: " + select.value, "info");
          });
        }
      }

    </script>
    <!-- Модальное окно бухгалтера: логика -->
    <script>
      const accountantModal = document.getElementById("accountantModal");
      const accFioEl = document.getElementById("accFio");
      const accRoomEl = document.getElementById("accRoom");
      const accPayment = document.getElementById("accPayment");
      const accMoveInDate = document.getElementById("accMoveInDate");
      const accRentalPeriod = document.getElementById("accRentalPeriod");

      function openAccountantModal(student, room) {
        accFioEl.textContent = student.fio;
        accRoomEl.textContent = room;
        accPayment.value = student.payment || "";
        accMoveInDate.value = student.moveInDate || "";
        accRentalPeriod.value = student.rentalPeriod || "";
        accountantModal.style.display = "flex";
      }

      document.getElementById("closeAccountantModal").addEventListener("click", () => {
        accountantModal.style.display = "none";
      });

      document.getElementById("accountantForm").addEventListener("submit", function (e) {
        e.preventDefault();
        const room = accRoomEl.textContent.trim();
        const fio = accFioEl.textContent.trim();
        const student = students[room]?.find(s => s.fio === fio);
        if (student) {
          student.payment = accPayment.value.trim();
          student.moveInDate = accMoveInDate.value.trim();
          student.rentalPeriod = accRentalPeriod.value;
          generateBlocks();
          showToast("Данные обновлены", "success");
          accountantModal.style.display = "none";
          updateGlobalStats();
        }
      });

      flatpickr("#accMoveInDate", {
        dateFormat: "Y-m-d",
        defaultDate: new Date(),
        locale: "ru",
      });
    </script>
    <div id="toastContainer" style="position: fixed; bottom: 20px; right: 20px; z-index: 9999;"></div>


    <script>
      function showToast(message = "Уведомление", type = "success") {
        const container = document.getElementById("toastContainer");
        const toast = document.createElement("div");
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => {
          toast.remove();
        }, 2300);
      }
    </script>
    <script>
      document.addEventListener("DOMContentLoaded", function () {
        fetch("/api/rooms/all")
          .then(res => res.json())
          .then(data => {
            allRooms = data;
            roomCapacities = {};
            allRooms.forEach(room => {
              roomCapacities[room.id] = room.places;
            });

            return fetch("/api/students");
          })
          .then(res => res.json())
          .then(data => {
            students = {};
            data.forEach(student => {
              const room = normalizeRoomId(student.room_id || "");
              if (!students[room]) students[room] = [];
              students[room].push({
                fio: student.fio,
                iin: student.iin,
                gender: student.gender,
                phone: student.phone,
                university: student.university,
                relative: student.relative_type,
                relativePhone: student.relative_phone,
                documentNumber: student.document_number,
                documentIssueDate: student.document_issue_date,
                documentIssuer: student.document_issuer,
                isGraduate: student.is_graduate,
                hasDisability: student.has_disability,
                payment: student.payment,
                moveInDate: student.move_in_date,
                rentalPeriod: student.rental_period,
                left: student.has_left,
                leftDate: student.left_date
              });
            });

            // === ИНИЦИАЛИЗАЦИЯ КАСТОМНОГО СЕЛЕКТА ПРОДЛЕНИЯ АРЕНДЫ ===
            const display = document.getElementById("displayExtendRental");
            const options = document.getElementById("optionsExtendRental");
            const hiddenInput = document.getElementById("extendRentalHidden");

            if (display && options && hiddenInput) {
              display.addEventListener("click", () => {
                const isOpen = options.style.display === "block";
                document.querySelectorAll(".custom-options").forEach(o => o.style.display = "none");
                document.querySelectorAll(".custom-select").forEach(d => d.classList.remove("active"));
                if (!isOpen) {
                  options.style.display = "block";
                  display.classList.add("active");
                }
              });

              options.querySelectorAll("div").forEach(opt => {
                opt.addEventListener("click", () => {
                  const val = opt.getAttribute("data-value");
                  hiddenInput.value = val;
                  display.textContent = opt.textContent;
                  options.querySelectorAll("div").forEach(d => d.classList.remove("selected"));
                  opt.classList.add("selected");
                  options.style.display = "none";
                });
              });

              window.addEventListener("click", (e) => {
                if (!e.target.closest(".custom-select-wrapper")) {
                  options.style.display = "none";
                  display.classList.remove("active");
                }
              });
            } else {
              console.warn("❌ Элементы кастомного селекта не найдены");
            }
            generateBlocks();
            document.getElementById("loading")?.remove();
          })
          .catch(err => {
            console.error("❌ Ошибка загрузки данных:", err);
            document.getElementById("blocksContainer").innerHTML =
              "<div style='color:red'>Не удалось загрузить данные.</div>";
            document.getElementById("loading")?.remove();
          });
      });
    </script>