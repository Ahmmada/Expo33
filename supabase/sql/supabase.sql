CREATE TABLE public.attendance_records (
  uuid uuid NOT NULL DEFAULT uuid_generate_v4(),
  date date NOT NULL,
  office_uuid uuid NOT NULL,
  level_uuid uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  is_synced boolean DEFAULT true,
  operation_type text,
  CONSTRAINT attendance_records_pkey PRIMARY KEY (uuid),
  CONSTRAINT fk_level_uuid FOREIGN KEY (level_uuid) REFERENCES public.levels(uuid),
  CONSTRAINT fk_office_uuid FOREIGN KEY (office_uuid) REFERENCES public.offices(uuid)
);
CREATE TABLE public.levels (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  uuid uuid DEFAULT gen_random_uuid() UNIQUE,
  name character varying NOT NULL UNIQUE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone,
  deleted_at timestamp with time zone,
  local_id integer,
  is_synced boolean DEFAULT true,
  operation_type text,
  user_id uuid DEFAULT auth.uid(),
  CONSTRAINT levels_pkey PRIMARY KEY (id),
  CONSTRAINT levels_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.offices (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  uuid uuid DEFAULT gen_random_uuid() UNIQUE,
  name character varying NOT NULL UNIQUE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone,
  deleted_at timestamp with time zone,
  local_id integer,
  is_synced boolean DEFAULT true,
  operation_type text,
  user_id uuid DEFAULT auth.uid(),
  CONSTRAINT offices_pkey PRIMARY KEY (id),
  CONSTRAINT offices_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  email text NOT NULL UNIQUE,
  full_name text,
  role text NOT NULL DEFAULT 'user'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  user_id uuid DEFAULT auth.uid(),
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id),
  CONSTRAINT profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.student_attendances (
  attendance_record_uuid uuid NOT NULL,
  student_uuid uuid NOT NULL,
  status USER-DEFINED NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  is_synced boolean DEFAULT true,
  operation_type text,
  CONSTRAINT student_attendances_pkey PRIMARY KEY (attendance_record_uuid, student_uuid),
  CONSTRAINT fk_student_uuid FOREIGN KEY (student_uuid) REFERENCES public.students(uuid),
  CONSTRAINT fk_attendance_record FOREIGN KEY (attendance_record_uuid) REFERENCES public.attendance_records(uuid)
);
CREATE TABLE public.students (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  uuid uuid DEFAULT gen_random_uuid() UNIQUE,
  name character varying NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone,
  deleted_at timestamp with time zone,
  local_id integer,
  is_synced boolean DEFAULT true,
  operation_type text,
  birth_date text,
  phone text,
  address text,
  office_id integer NOT NULL DEFAULT 1,
  level_id integer NOT NULL DEFAULT 1,
  user_id uuid DEFAULT auth.uid(),
  CONSTRAINT students_pkey PRIMARY KEY (id),
  CONSTRAINT fk_level FOREIGN KEY (level_id) REFERENCES public.levels(id),
  CONSTRAINT fk_office FOREIGN KEY (office_id) REFERENCES public.offices(id),
  CONSTRAINT students_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.user_offices (
  user_id uuid NOT NULL,
  office_id integer NOT NULL,
  CONSTRAINT user_offices_pkey PRIMARY KEY (user_id, office_id),
  CONSTRAINT user_offices_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT user_offices_office_id_fkey FOREIGN KEY (office_id) REFERENCES public.offices(id)
);