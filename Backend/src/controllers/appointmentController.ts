import { Request, Response } from 'express';
import * as appointmentService from '../services/appointmentService';

export const scheduleAppointment = async (req: Request, res: Response) => {
  const appointment = await appointmentService.scheduleAppointment({
    patientId: req.user!.id,
    scheduleId: req.body?.scheduleId,
  });
  res.status(201).json({ message: 'Appointment scheduled successfully', appointment });
};

export const cancelAppointment = async (req: Request, res: Response) => {
  const appointment = await appointmentService.cancelAppointment(req.params.id, req.user!);
  res.status(200).json({ message: 'Appointment canceled successfully', appointment });
};

export const getAppointments = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id; // ID del usuario autenticado
    const role = req.user?.role as string | undefined; // Rol del usuario

    if (!userId) {
      res.status(401).json({ message: 'No autorizado' });
    }

    let appointments;

    if (role === 'patient') {
      appointments = await appointmentService.getAppointmentsByPatient(userId as string);
    } else if (role === 'psychologist') {
      appointments = await appointmentService.getAppointmentsByPsychologist(userId as string);
    } else {
      res.status(403).json({ message: 'Acceso no permitido' });
    }

    res.status(200).json(appointments);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener las citas', error });
  }
};

export const updateAppointment = async (req: Request, res: Response) => {
  const updatedAppointment = await appointmentService.updateAppointment(req.params.id, req.body ?? {}, req.user!);
  res.status(200).json({ message: 'Cita actualizada correctamente', updatedAppointment });
};
