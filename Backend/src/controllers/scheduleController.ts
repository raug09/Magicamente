// controllers/scheduleController.ts
import { Request, Response } from 'express';
import * as scheduleService from '../services/scheduleService';

export const createSchedule = async (req: Request, res: Response): Promise<void> => {
  try {
      console.log("📌 Datos recibidos en el controlador:", req.body);
      const currentDate = new Date();

      if (new Date(req.body.day) < currentDate) {
          res.status(400).json({ message: "No puedes crear horarios en fechas pasadas" });
          return;
      }

      const result = await scheduleService.createSchedule(req.body);
      console.log("📌 Resultado del servicio:", result);

      if (result.error) {
          res.status(400).json({ message: result.error });
          return;
      }

      res.status(201).json({ message: "Horario creado exitosamente", schedule: result.schedule });
  } catch (error) {
      console.log("⚠️ Error en el controlador:", error);
      res.status(500).json({ message: "Error interno al crear el horario", error });
  }
};



export const getSchedulesByPsychologist = async (req: Request, res: Response) => {
  try {

    const { psychologistId } = req.params;

    const schedules = await scheduleService.getScheduleById(psychologistId);
    res.status(200).json(schedules);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener horarios', error });
  }
};
