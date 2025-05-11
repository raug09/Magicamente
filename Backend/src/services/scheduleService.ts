import Schedule, { ISchedule } from '../models/Schedule';
import User from '../models/User';


export const createSchedule = async (scheduleData: ISchedule) => {
  try {
      console.log("📌 Datos recibidos para crear horario:", scheduleData);

      // 1️⃣ Verificar que el psicólogo existe antes de continuar
      const psychologist = await User.findById(scheduleData.psychologist);
      if (!psychologist) {
          console.log("❌ Error: Psicólogo no encontrado");
          throw new Error("Psicólogo no encontrado");
      }

      // 2️⃣ Verificar si ya existe un horario con la misma fecha y hora
      const existingSchedule = await Schedule.findOne({
          psychologist: scheduleData.psychologist,
          day: scheduleData.day,
          hour: scheduleData.hour
      });

      if (existingSchedule) {
          console.log("❌ Error: Ya existe un horario con la misma fecha y hora");
          throw new Error("Ya existe un horario con la misma fecha y hora para este psicólogo.");
      }

      // 3️⃣ Crear el horario SOLO si pasó las validaciones anteriores
      const schedule = await Schedule.create(scheduleData);
      console.log("✅ Horario creado correctamente:", schedule);

      // 4️⃣ Agregar el horario al array de horarios del psicólogo
      await User.findByIdAndUpdate(
          schedule.psychologist,
          { $push: { schedules: schedule._id } },
          { new: true }
      );

      console.log("✅ Horario agregado al psicólogo correctamente:", schedule);
      return { schedule };

  } catch (error) {
      console.log("⚠️ Error en createSchedule:", (error as Error).message);
      return { error: (error as Error).message };  // Retornar el mensaje de error para el controlador
  }
};

export const getScheduleById = async (psychologist: string) => {
    return await Schedule.find({ psychologist });
};
export const updateAvailabilitySchedule = async (scheduleId: string, isAvailable: boolean) => {
    await Schedule.findByIdAndUpdate(scheduleId, { isAvailable });
};