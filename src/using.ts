'use strict';

/// https://gist.github.com/dsherret/cf5d6bec3d0f791cef00

/**
 *
 *
 * @interface IDisposable
 */
export interface IDisposable
{
    /**
     *
     *
     * @memberof IDisposable
     */
    dispose(): void;
}

/**
 *
 *
 * @export
 * @param {any} resource
 * @param {any} func
 */
export function using(resource, func): void
{
    try
    {
        func(resource);
    }
    finally
    {
        resource.dispose();
    }
}

/*
Example Usage:

class Camera implements IDisposable
{
    takePicture() { ... }
    dispose()
    {
      navigator.camera.cleanup();
    }
}

using(new Camera(), (camera) => {
  camera.takePicture();
});
*/
