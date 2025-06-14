CREATE TABLE public.web_user (
    id            SERIAL PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL
);

CREATE TABLE public.session (
    token      UUID PRIMARY KEY,
    user_id    INTEGER     NOT NULL REFERENCES public.web_user (id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_sessions_user_id ON public.session (user_id);
