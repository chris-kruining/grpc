export function race(...signals: AbortSignal[]): AbortSignal
{
    const controller = new AbortController();
    const abort = () => {
        controller.abort();

        for(const signal of signals)
        {
            signal.removeEventListener('abort', abort);
        }
    };

    for(const signal of signals)
    {
        signal.addEventListener('abort', abort);
    }

    return controller.signal;
}

export function all(...signals: AbortSignal[]): AbortSignal
{
    const controller = new AbortController();
    const listeners = signals.map(signal =>
        new Promise<void>(res =>
            signal.addEventListener('abort', () => res(), { once: true })
        )
    );

    Promise.all(listeners).then(() => controller.abort());

    return controller.signal;
}