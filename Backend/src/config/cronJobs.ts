import cron from "node-cron";
import Appointment from "../models/appointment"; // Modelo de citas (verifica el nombre)
import { sendEmail } from "../services/emailService"; // Servicio de envío de correos
import User from "../models/User"; // Para obtener información del usuario

cron.schedule("* * * * *", async () => {
  console.log("Ejecutando tarea de recordatorio de citas...");

  try {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(now.getUTCDate() + 1); // Asegurar que se usa UTC para evitar problemas de horario
    console.log(tomorrow, now);

    // Buscar citas que ocurren mañana
    const appointments = await Appointment.find({
      time: {
        $gte: new Date(tomorrow.setHours(0, 0, 0, 0)), // Desde medianoche de mañana
        $lt: new Date(tomorrow.setHours(23, 59, 59, 999)), // Hasta final del día
      },
    });

    if (!appointments.length) {
      console.log("No hay citas programadas para mañana.");
      return;
    }

    for (const appointment of appointments) {
      try {
        // Verificar si el paciente existe
        const user = await User.findById(appointment.patientId);
        if (!user) {
          console.warn(`No se encontró usuario con ID: ${appointment.patientId}`);
          continue;
        }

        const { name, email } = user;

        const appointmentUTC = appointment.time; // Se almacena en UTC
        console.log("📅 Fecha UTC de la BD:", appointmentUTC);
        
        const formattedDate = appointmentUTC.getUTCDate();
        const formattedHour = appointmentUTC.getUTCHours();
        
        // Enviar correo de recordatorio
        await sendEmail("appointmentReminder", email, name, formattedDate, formattedHour);
        console.log(`Correo enviado a ${email} para la cita del ${formattedDate} a las ${formattedHour}`);
      } catch (error) {
        console.error(`Error al procesar cita ${appointment._id}:`, error);
      }
    }
  } catch (error) {
    console.error("Error al ejecutar el cron de recordatorio de citas:", error);
  }
});
