-- Create user roles enum
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Create patient_workspaces table
CREATE TABLE public.patient_workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  patient_id TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.patient_workspaces ENABLE ROW LEVEL SECURITY;

-- Create workspace_files table
CREATE TABLE public.workspace_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.patient_workspaces(id) ON DELETE CASCADE NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  page_count INTEGER,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.workspace_files ENABLE ROW LEVEL SECURITY;

-- Create file_pages table for storing extracted text and metadata
CREATE TABLE public.file_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID REFERENCES public.workspace_files(id) ON DELETE CASCADE NOT NULL,
  page_number INTEGER NOT NULL,
  extracted_text TEXT,
  ocr_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (file_id, page_number)
);

ALTER TABLE public.file_pages ENABLE ROW LEVEL SECURITY;

-- Create page_diagnoses table
CREATE TABLE public.page_diagnoses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID REFERENCES public.file_pages(id) ON DELETE CASCADE NOT NULL,
  diagnosis_text TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.page_diagnoses ENABLE ROW LEVEL SECURITY;

-- Create keyword_matches table
CREATE TABLE public.keyword_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID REFERENCES public.file_pages(id) ON DELETE CASCADE NOT NULL,
  keyword TEXT NOT NULL,
  match_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.keyword_matches ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- RLS Policies for user_roles
CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage roles"
  ON public.user_roles FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for patient_workspaces
CREATE POLICY "Authenticated users can view workspaces"
  ON public.patient_workspaces FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create workspaces"
  ON public.patient_workspaces FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can update their own workspaces"
  ON public.patient_workspaces FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Users can delete their own workspaces"
  ON public.patient_workspaces FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());

-- RLS Policies for workspace_files
CREATE POLICY "Users can view files in any workspace"
  ON public.workspace_files FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can upload files to workspaces"
  ON public.workspace_files FOR INSERT
  TO authenticated
  WITH CHECK (uploaded_by = auth.uid());

CREATE POLICY "Users can delete files they uploaded"
  ON public.workspace_files FOR DELETE
  TO authenticated
  USING (uploaded_by = auth.uid());

-- RLS Policies for file_pages
CREATE POLICY "Users can view pages"
  ON public.file_pages FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert pages"
  ON public.file_pages FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update pages"
  ON public.file_pages FOR UPDATE
  TO authenticated
  USING (true);

-- RLS Policies for page_diagnoses
CREATE POLICY "Users can view diagnoses"
  ON public.page_diagnoses FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can create diagnoses"
  ON public.page_diagnoses FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can update their own diagnoses"
  ON public.page_diagnoses FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Users can delete their own diagnoses"
  ON public.page_diagnoses FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());

-- RLS Policies for keyword_matches
CREATE POLICY "Users can view keyword matches"
  ON public.keyword_matches FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can create keyword matches"
  ON public.keyword_matches FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Trigger function for profiles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  RETURN NEW;
END;
$$;

-- Trigger to create profile on signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Trigger function for updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Add updated_at triggers
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.patient_workspaces
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.page_diagnoses
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Create storage bucket for PDFs
INSERT INTO storage.buckets (id, name, public)
VALUES ('pdf-files', 'pdf-files', false);

-- Storage RLS policies
CREATE POLICY "Authenticated users can upload PDFs"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'pdf-files');

CREATE POLICY "Authenticated users can view PDFs"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'pdf-files');

CREATE POLICY "Users can delete their own PDFs"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'pdf-files' AND auth.uid()::text = (storage.foldername(name))[1]);