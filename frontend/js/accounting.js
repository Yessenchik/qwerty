document.addEventListener("DOMContentLoaded", () => {
  const accountantModal = document.getElementById("accountantModal");
  const accFioEl = document.getElementById("accFio");
  const accRoomEl = document.getElementById("accRoom");
  const accPayment = document.getElementById("accPayment");
  const accMoveInDate = document.getElementById("accMoveInDate");
  const accRentalPeriod = document.getElementById("accRentalPeriod");

  window.openAccountantModal = function(student, room) {
    accFioEl.textContent = student.fio;
    accRoomEl.textContent = room;
    accPayment.value = student.payment || "";
    accMoveInDate.value = student.moveInDate || "";
    accRentalPeriod.value = student.rentalPeriod || "";
    accountantModal.style.display = "flex";
    recalculateTotal(); // при открытии сразу посчитать
  };

  document.getElementById("closeAccountantModal")?.addEventListener("click", () => {
    accountantModal.style.display = "none";
  });

  const accBtn = document.getElementById("accountingBtn");
  if (accBtn) {
    accBtn.addEventListener("click", () => {
      if (!window.state?.currentRoom) {
        window.showToast?.("Сначала откройте досье комнаты", "error");
        return;
      }
      const room = window.state.currentRoom;
      const student = (window.students?.[room] || []).find(s => !s.left);
      if (!student) {
        window.showToast?.("Нет активных студентов в комнате", "error");
        return;
      }
      window.openAccountantModal(student, room);
    });
  } else {
    console.warn("❗ Кнопка #accountingBtn не найдена в DOM");
  }

  document.getElementById("accountantForm")?.addEventListener("submit", function (e) {
    e.preventDefault();
    const room = accRoomEl.textContent.trim();
    const fio = accFioEl.textContent.trim();
    const student = window.students?.[room]?.find(s => s.fio === fio);
    if (student) {
      student.payment = accPayment.value.trim();
      student.moveInDate = accMoveInDate.value.trim();
      student.rentalPeriod = accRentalPeriod.value;
      window.generateBlocks?.();
      window.showToast?.("Данные обновлены", "success");
      accountantModal.style.display = "none";
      window.updateGlobalStats?.();
    }
  });

  if (window.flatpickr) {
    flatpickr("#accMoveInDate", {
      dateFormat: "Y-m-d",
      defaultDate: new Date(),
      locale: "ru",
    });
  }

  const recalculateTotal = () => {
    const payment = parseFloat(accPayment.value);
    const months = parseInt(accRentalPeriod.value);
    const total = (!isNaN(payment) && !isNaN(months)) ? payment * months : 0;
    document.getElementById("accTotal").textContent = total.toLocaleString("ru-RU");
  };

  accPayment?.addEventListener("input", recalculateTotal);
  accRentalPeriod?.addEventListener("change", recalculateTotal);
});