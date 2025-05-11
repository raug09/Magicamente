import { Request, Response } from 'express';
import * as appointmentService from '../services/appointmentService';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    role: string;
  };
}
export const scheduleAppointment = async (req: Request, res: Response) => {
  try {
    const appointment = await appointmentService.scheduleAppointment(req.body);
    res.status(201).json({ message: 'Appointment scheduled successfully', appointment });
  } catch (error) {
    res.status(500).json({ message: 'Error scheduling appointment', error });
  }
};

export const cancelAppointment = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const appointment = await appointmentService.cancelAppointment(id);
    if (!appointment) {
      res.status(404).json({ message: 'Appointment not found' });
    }
    res.status(200).json({ message: 'Appointment canceled successfully', appointment });
  } catch (error) {
    res.status(500).json({ message: 'Error canceling appointment', error });
  }
};
export const getAppointments = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as AuthRequest).user?.id; // ID del usuario autenticado
    const role = (req as AuthRequest).user?.role; // Rol del usuario

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
  try {
    const { id } = req.params;
    const updateData = req.body;

    const updatedAppointment = await appointmentService.updateAppointment(id, updateData);
    res.status(200).json({ message: 'Cita actualizada correctamente', updatedAppointment });
  } catch (error) {
    res.status(400).json({ message: 'Error al actualizar la cita', error });
  }
};