import { Matrix4, Vector3, Ray, DoubleSide, Line3, BufferGeometry, BufferAttribute } from 'three';
import { ADDITION, SUBTRACTION, DIFFERENCE, INTERSECTION, PASSTHROUGH } from './constants.js';
import { ExtendedTriangle } from 'three-mesh-bvh';

const _matrix = new Matrix4();
const _v0 = new Vector3();
const _v1 = new Vector3();
const _v2 = new Vector3();
const _vec = new Vector3();
const _ray = new Ray();
const _triA = new ExtendedTriangle();
const _triB = new ExtendedTriangle();
const _edge = new Line3();

// TODO: take a target geometry so we don't have to create a new one every time
export function performOperation( a, b, operation ) {

	const attributeData = {
		position: [],
		uv: [],
		normal: [],
	};

	const { aToB, bToA } = collectIntersectingTriangles( a, b );

	// TODO: use the half edge structure to find siblings
	accumulateTriangles( a, b, aToB, operation, false, attributeData );
	accumulateTriangles( b, a, bToA, operation, true, attributeData );

	// TODO: clip and trim triangles

	const result = new BufferGeometry();
	result.setAttribute( 'position', new BufferAttribute( new Float32Array( attributeData.position ), 3 ) );
	result.setAttribute( 'normal', new BufferAttribute( new Float32Array( attributeData.normal ), 3 ) );
	result.setAttribute( 'uv', new BufferAttribute( new Float32Array( attributeData.uv ), 2 ) );

	return result;

}

function clipTriangles( a, b, triSets, attributeData ) {

	const bBVH = b.geometry.boundsTree;
	const aPosition = a.geometry.attributes.position;
	const aIndex = a.geometry.index;
	const aAttributes = a.geometry.attributes;

	// TODO: how do we handle the case of tris clipped by multiple edges?
	for ( const key in triSets ) {

		const tris = triSets[ key ];
		const ia = parseInt( key );
		const ia3 = 3 * ia;

		const ia0 = aIndex.getX( ia3 + 0 );
		const ia1 = aIndex.getX( ia3 + 1 );
		const ia2 = aIndex.getX( ia3 + 2 );
		_triA.a.fromBufferAttribute( aPosition, ia0 );
		_triA.b.fromBufferAttribute( aPosition, ia1 );
		_triA.c.fromBufferAttribute( aPosition, ia2 );
		_triA.needsUpdate = true;

		for ( let i = 0, l = tris.length; i < l; i ++ ) {

			const ib3 = 3 * ib;
			const ib0 = aIndex.getX( ib3 + 0 );
			const ib1 = aIndex.getX( ib3 + 1 );
			const ib2 = aIndex.getX( ib3 + 2 );
			_triB.a.fromBufferAttribute( aPosition, ib0 );
			_triB.b.fromBufferAttribute( aPosition, ib1 );
			_triB.c.fromBufferAttribute( aPosition, ib2 );
			_triB.needsUpdate = true;

			// TODO: handle the coplanar case
			_triA.intersectsTriangle( _triB, _edge );

		}

	}

}

function accumulateTriangles( a, b, skipTriSet, operation, invert, attributeData ) {

	_matrix
		.copy( b.matrixWorld )
		.invert()
		.multiply( a.matrixWorld );

	const bBVH = b.geometry.boundsTree;
	const aIndex = a.geometry.index;
	const aAttributes = a.geometry.attributes;
	const aPosition = aAttributes.position;
	for ( let i = 0, l = aIndex.count / 3; i < l; i ++ ) {

		if ( i in skipTriSet ) continue;

		const i3 = 3 * i;
		const i0 = aIndex.getX( i3 + 0 );
		const i1 = aIndex.getX( i3 + 1 );
		const i2 = aIndex.getX( i3 + 2 );

		_v0.fromBufferAttribute( aPosition, i0 );
		_v1.fromBufferAttribute( aPosition, i1 );
		_v2.fromBufferAttribute( aPosition, i2 );

		_ray.origin.copy( _v0 ).add( _v1 ).add( _v2 ).multiplyScalar( 1 / 3 ).applyMatrix4( _matrix );
		_ray.direction.set( 0, 0, 1 );

		const hit = bBVH.raycastFirst( _ray, DoubleSide );
		const hitBackSide = Boolean( hit && hit.face.normal.z > 0 );

		switch ( operation ) {

			case ADDITION:
				if ( hitBackSide === false ) {

					appendTriAttributes( i0, i1, i2, aAttributes, a.matrixWorld, attributeData );

				}

				break;
			case SUBTRACTION:
				if ( invert ) {

					if ( hitBackSide === true ) {

						appendTriAttributes( i2, i1, i0, aAttributes, a.matrixWorld, attributeData );

					}

				} else {

					if ( hitBackSide === false ) {

						appendTriAttributes( i0, i1, i2, aAttributes, a.matrixWorld, attributeData );

					}

				}

				break;
			case DIFFERENCE:
				if ( hitBackSide ) {

					appendTriAttributes( i2, i1, i0, aAttributes, a.matrixWorld, attributeData );

				} else {

					appendTriAttributes( i0, i1, i2, aAttributes, a.matrixWorld, attributeData );

				}

				break;
			case INTERSECTION:
				if ( hitBackSide === true ) {

					appendTriAttributes( i0, i1, i2, aAttributes, a.matrixWorld, attributeData );


				}

				break;
			case PASSTHROUGH:
				appendTriAttributes( i0, i1, i2, aAttributes, a.matrixWorld, attributeData );
				break;

		}

	}

}

function appendTriAttributes( i0, i1, i2, attributes, matrixWorld, info ) {

	appendAttributes( i0, attributes, matrixWorld, info );
	appendAttributes( i1, attributes, matrixWorld, info );
	appendAttributes( i2, attributes, matrixWorld, info );

}

function appendAttributes( index, attributes, matrixWorld, info ) {

	for ( const key in info ) {

		const attr = attributes[ key ];
		const arr = info[ key ];
		if ( ! ( key in attributes ) ) {

			throw new Error();

		}

		const itemSize = attr.itemSize;

		if ( key === 'position' ) {

			_vec.fromBufferAttribute( attr, index ).applyMatrix4( matrixWorld );
			arr.push( _vec.x, _vec.y, _vec.z );

		} else if ( key === 'normal' ) {

			_vec.fromBufferAttribute( attr, index ).transformDirection( matrixWorld	);
			arr.push( _vec.x, _vec.y, _vec.z );

		} else {

			arr.push( attr.getX( index ) );
			if ( itemSize > 1 ) arr.push( attr.getY( index ) );
			if ( itemSize > 2 ) arr.push( attr.getZ( index ) );
			if ( itemSize > 3 ) arr.push( attr.getW( index ) );

		}

	}

}

function collectIntersectingTriangles( a, b ) {

	const aToB = {};
	const bToA = {};

	_matrix
		.copy( a.matrixWorld )
		.invert()
		.multiply( b.matrixWorld );

	a.geometry.boundsTree.bvhcast( b.geometry.boundsTree, _matrix, {

		intersectsTriangles( triangle1, triangle2, i1, i2 ) {

			if ( triangle1.intersectsTriangle( triangle2, _edge ) ) {

				if ( ! aToB[ i1 ] ) aToB[ i1 ] = [];
				if ( ! bToA[ i2 ] ) bToA[ i2 ] = [];

				aToB[ i1 ].push( i2 );
				bToA[ i2 ].push( i1 );


			}

		}

	} );

	return { aToB, bToA };

}
