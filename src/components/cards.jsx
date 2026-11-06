import React from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Clock, Users, MapPin, ArrowUpRight, Video } from 'lucide-react';
import { Avatar, Stars, Badge } from './ui.jsx';
import { formatDate, formatTime, formatMT, formatDuration, PHASE_LABELS } from '../lib/format.js';

const phaseTone = { published: 'green', awaiting_payment: 'orange', confirmed: 'blue', completed: 'gray', cancelled: 'red', draft: 'gray', booked: 'purple', in_progress: 'blue' };
export function LessonCard({ lesson }) {
  const phase = lesson.phase || 'published';
  return (
    <Link to={`/aula/${lesson.id}`} className="card card-hover lesson-card" style={{ color: 'inherit' }}>
      <div className="lesson-top">
        <div className="flex gap-6 wrap"><Badge tone="green">{lesson.subject_name}</Badge><Badge tone={phaseTone[phase] || 'gray'} dot>{PHASE_LABELS[phase] || phase}</Badge></div>
        <span className="price" style={{ fontSize: '.95rem' }}>{formatMT(lesson.price)}</span>
      </div>
      <div>
        <div className="lesson-title">{lesson.title}</div>
        <div className="lesson-meta" style={{ marginTop: 7 }}>
          <span><CalendarDays size={13} />{formatDate(lesson.start_at, { day: '2-digit', month: 'short' })} · {formatTime(lesson.start_at)}</span>
          <span><Clock size={13} />{formatDuration(lesson.duration)}</span>
          <span><Users size={13} />{lesson.mode === 'individual' ? 'Individual' : `${lesson.seats} lugares`}</span>
        </div>
      </div>
      <div className="lesson-teacher">
        <Avatar name={lesson.teacher_name} src={lesson.photo_file_id ? `/api/files/${lesson.photo_file_id}` : null} size="sm" />
        <div style={{ minWidth: 0, flex: 1 }}><strong>{lesson.teacher_name}</strong><span>{lesson.level_name} · {lesson.teacher_city}</span></div>
        <span className="flex align-center gap-6 tiny muted"><Video size={13} /> {Math.max(0, lesson.seatsLeft)} livre{lesson.seatsLeft === 1 ? '' : 's'}</span>
      </div>
    </Link>
  );
}
export function TeacherCard({ teacher }) {
  return (
    <Link to={`/professor/${teacher.id}`} className="card card-hover teacher-card" style={{ color: 'inherit' }}>
      <div className="teacher-head">
        <Avatar name={teacher.name} src={teacher.photoFileId ? `/api/files/${teacher.photoFileId}` : null} size="lg" tone="purple" />
        <div style={{ minWidth: 0 }}>
          <h3>{teacher.name}</h3>
          <p>{teacher.headline}</p>
          <div className="flex gap-8 align-center" style={{ marginTop: 5 }}><Stars value={teacher.rating?.average || 0} /><span className="tiny muted">({teacher.rating?.count || 0})</span></div>
        </div>
      </div>
      <div className="teacher-subjects">{teacher.subjectNames?.slice(0, 3).map(s => <Badge key={s} tone="gray">{s}</Badge>)}</div>
      <div className="teacher-foot">
        <span className="tiny muted flex align-center gap-6"><MapPin size={13} />{teacher.city}</span>
        <span className="flex align-center gap-8"><span className="price">{formatMT(teacher.price)}<small>/aula</small></span><ArrowUpRight size={16} /></span>
      </div>
    </Link>
  );
}
